import { and, inArray, sql, eq, asc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests } from "../../../../db/schema";
import { getEffectiveRulesBatch } from "../../../../lib/rules";
import { getHolidayCalendar } from "../../../../lib/holidays";
import { resolveWeekOffs, weekBounds, eachDate, type DayKind } from "../../../../lib/week-off";
import { externalApiKey, sharedEmployeeIds, isValidExternalKey } from "../../../../lib/external-api";

/**
 * GET /api/external/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD[&employeeId=EMP-1001]
 * Header: Authorization: Bearer <EXTERNAL_API_KEY>
 *
 * Returns day-by-day attendance for the employees listed in EXTERNAL_API_EMPLOYEES.
 * Defaults to the current month up to today; at most 93 days per request.
 * Times are IST (+05:30). No selfies or GPS coordinates are included.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 93;
const IST_OFFSET_MIN = 330;

function parseUtc(ts: string): Date {
  return new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
}

/** "2026-11-03 03:42:10" (UTC) → "2026-11-03T09:12:10+05:30" */
function toIst(ts: string): string {
  const d = new Date(parseUtc(ts).getTime() + IST_OFFSET_MIN * 60_000);
  return d.toISOString().slice(0, 19) + "+05:30";
}

function istMinutesOfDay(ts: string): number {
  const d = parseUtc(ts);
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + IST_OFFSET_MIN) % (24 * 60);
}

export async function GET(request: Request) {
  const key = externalApiKey();
  if (!key) return Response.json({ error: "Not found." }, { status: 404 });
  if (!isValidExternalKey(request, key)) {
    return Response.json({ error: "Invalid or missing API key." }, { status: 401 });
  }

  const allowed = sharedEmployeeIds();
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || today.slice(0, 8) + "01";
  let to = url.searchParams.get("to") || today;
  const onlyId = url.searchParams.get("employeeId");

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return Response.json({ error: "from and to must be YYYY-MM-DD." }, { status: 400 });
  }
  if (to > today) to = today;
  if (from > to) {
    return Response.json({ error: "from must be on or before to (and not in the future)." }, { status: 400 });
  }
  const days = eachDate(from, to);
  if (days.length > MAX_DAYS) {
    return Response.json({ error: `At most ${MAX_DAYS} days per request.` }, { status: 400 });
  }
  if (onlyId && !allowed.includes(onlyId)) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }
  const ids = onlyId ? [onlyId] : allowed;
  if (ids.length === 0) {
    return Response.json({ from, to, timezone: "Asia/Kolkata", employees: [] });
  }

  const db = getDb();
  const emps = db
    .select({
      id: employees.id,
      name: employees.name,
      jobRole: employees.jobRole,
      department: employees.department,
      workStartTime: employees.workStartTime,
      workEndTime: employees.workEndTime,
      flexibleHours: employees.flexibleHours,
      paidHolidays: employees.paidHolidays,
    })
    .from(employees)
    .where(inArray(employees.id, ids))
    .orderBy(employees.name)
    .all();

  // Week-offs are decided per whole Mon–Sun week, so load the full weeks
  const range = weekBounds(from, to);
  const empIds = emps.map((e) => e.id);
  const punches = empIds.length === 0 ? [] : db
    .select({
      employeeId: attendance.employeeId,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      office: attendance.office,
      source: attendance.source,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .where(and(
      inArray(attendance.employeeId, empIds),
      sql`date(${attendance.serverTimestamp}) >= ${range.start}`,
      sql`date(${attendance.serverTimestamp}) <= ${range.end}`,
    ))
    .orderBy(asc(attendance.serverTimestamp))
    .all();

  const leaves = empIds.length === 0 ? [] : db
    .select({ employeeId: leaveRequests.employeeId, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, leaveType: leaveRequests.leaveType })
    .from(leaveRequests)
    .where(and(
      inArray(leaveRequests.employeeId, empIds),
      eq(leaveRequests.status, "approved"),
      sql`${leaveRequests.toDate} >= ${range.start}`,
      sql`${leaveRequests.fromDate} <= ${range.end}`,
    ))
    .all();

  const holidayCal = getHolidayCalendar(range.start, range.end);
  const rulesByEmp = getEffectiveRulesBatch(empIds);

  const result = emps.map((emp) => {
    const rules = rulesByEmp.get(emp.id)!;
    const empPunches = punches.filter((p) => p.employeeId === emp.id);
    const byDate = new Map<string, typeof empPunches>();
    for (const p of empPunches) {
      const d = p.serverTimestamp.slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(p);
    }
    const leaveByDate = new Map<string, string>();
    for (const l of leaves.filter((x) => x.employeeId === emp.id)) {
      for (const d of eachDate(l.fromDate < range.start ? range.start : l.fromDate, l.toDate > range.end ? range.end : l.toDate)) {
        leaveByDate.set(d, l.leaveType);
      }
    }

    const isUH = (list: typeof empPunches | undefined) => !!list?.some((p) => p.photoKey === "admin/unpaid-holiday");
    const realPunches = (list: typeof empPunches | undefined) => (list || []).filter((p) => p.photoKey !== "admin/unpaid-holiday");

    const { weekOff, extraPay } = resolveWeekOffs(from, to, (date): DayKind => {
      if (holidayCal.byDate.has(date)) return "holiday";
      if (leaveByDate.has(date)) return "excused";
      const list = realPunches(byDate.get(date));
      const hasIn = list.some((p) => p.punchType === "IN");
      const hasOut = list.some((p) => p.punchType === "OUT");
      if (hasIn && (hasOut || date === today)) return "worked";
      if (isUH(byDate.get(date))) return "excused";
      return "off";
    }, today);

    const [sh, sm] = emp.workStartTime.split(":").map(Number);
    const graceUntil = sh * 60 + sm + rules.grace_period;

    const summary = { present: 0, late: 0, absent: 0, missedPunchOut: 0, leave: 0, holiday: 0, weekOff: 0, workedMinutes: 0 };

    const daysOut = days.map((date) => {
      const list = realPunches(byDate.get(date));
      const firstIn = list.find((p) => p.punchType === "IN") || null;
      const lastOut = [...list].reverse().find((p) => p.punchType === "OUT") || null;

      // Sum every IN→OUT pair (re-entry / flex sessions)
      let workedMinutes = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i].punchType === "IN" && list[i + 1]?.punchType === "OUT") {
          workedMinutes += Math.max(0, Math.floor((parseUtc(list[i + 1].serverTimestamp).getTime() - parseUtc(list[i].serverTimestamp).getTime()) / 60000));
          i++;
        }
      }

      const holiday = holidayCal.byDate.get(date);
      let status: string;
      let lateByMinutes: number | null = null;
      if (firstIn) {
        if (!lastOut && date < today) status = "missed_punch_out";
        else if (!lastOut) status = "in_progress";
        else if (emp.flexibleHours) status = "present";
        else {
          const m = istMinutesOfDay(firstIn.serverTimestamp);
          if (m <= graceUntil) status = "present";
          else { status = "late"; lateByMinutes = m - (sh * 60 + sm); }
        }
      } else if (holiday) {
        status = emp.flexibleHours || holidayCal.isPaidFor(holiday, emp) ? "paid_holiday" : "unpaid_holiday";
      } else if (leaveByDate.has(date)) {
        status = "leave";
      } else if (isUH(byDate.get(date))) {
        status = "unpaid_holiday";
      } else if (weekOff.has(date)) {
        status = "week_off";
      } else {
        status = "absent";
      }

      if (status === "present") summary.present++;
      else if (status === "late") summary.late++;
      else if (status === "absent") summary.absent++;
      else if (status === "missed_punch_out") summary.missedPunchOut++;
      else if (status === "leave") summary.leave++;
      else if (status === "week_off") summary.weekOff++;
      else if (status.endsWith("holiday")) summary.holiday++;
      summary.workedMinutes += workedMinutes;

      return {
        date,
        status,
        punchIn: firstIn ? toIst(firstIn.serverTimestamp) : null,
        punchOut: lastOut ? toIst(lastOut.serverTimestamp) : null,
        workedMinutes: workedMinutes || null,
        lateByMinutes,
        office: firstIn?.office ?? null,
        ...(holiday ? { holidayName: holiday.name } : {}),
        ...(leaveByDate.has(date) ? { leaveType: leaveByDate.get(date) } : {}),
        ...(extraPay.has(date) ? { weekOffWorked: true } : {}),
        punches: list.map((p) => ({
          type: p.punchType,
          time: toIst(p.serverTimestamp),
          office: p.office,
          source: p.source, // "selfie" or "admin"
        })),
      };
    });

    return {
      id: emp.id,
      name: emp.name,
      jobRole: emp.jobRole,
      department: emp.department,
      shift: emp.flexibleHours ? "flexible" : `${emp.workStartTime}-${emp.workEndTime}`,
      summary,
      days: daysOut,
    };
  });

  return Response.json(
    { from, to, timezone: "Asia/Kolkata", generatedAt: toIst(new Date().toISOString()), employees: result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
