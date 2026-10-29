import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { getEffectiveRulesBatch } from "../../../../lib/rules";
import { calculateTotalDuration, calculateBreakDuration } from "../../../../lib/time-utils";
import { getHolidayCalendar } from "../../../../lib/holidays";

type SessionInfo = { inTime: string; outTime: string | null; durationMinutes: number | null };

function buildSessions(allPunches: { punchType: string; serverTimestamp: string }[]): SessionInfo[] {
  const sorted = [...allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
  const sessions: SessionInfo[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].punchType === "IN") {
      const out = sorted[i + 1]?.punchType === "OUT" ? sorted[i + 1] : null;
      let dur: number | null = null;
      if (out) {
        const inD = new Date(sorted[i].serverTimestamp.replace(" ", "T") + (sorted[i].serverTimestamp.includes("Z") ? "" : "Z"));
        const outD = new Date(out.serverTimestamp.replace(" ", "T") + (out.serverTimestamp.includes("Z") ? "" : "Z"));
        dur = Math.max(0, Math.floor((outD.getTime() - inD.getTime()) / 60000));
      }
      sessions.push({ inTime: sorted[i].serverTimestamp, outTime: out?.serverTimestamp ?? null, durationMinutes: dur });
      if (out) i++;
    }
  }
  return sessions;
}

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const now = new Date();
  const month = url.searchParams.get("month") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10);
  const firstDay = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const lastDayStr = `${month}-${String(lastDay).padStart(2, "0")}`;

  const db = getDb();

  const allEmployees = db
    .select({
      id: employees.id,
      name: employees.name,
      workStartTime: employees.workStartTime,
      workEndTime: employees.workEndTime,
      jobRole: employees.jobRole,
      office: employees.office,
      monthlySalary: employees.monthlySalary,
      hourlyRate: employees.hourlyRate,
      flexibleHours: employees.flexibleHours,
      paidHolidays: employees.paidHolidays,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .where(and(eq(employees.active, true), sql`${employees.role} != 'admin'`))
    .orderBy(employees.name)
    .all();

  // Get ALL attendance records (IN + OUT) for the month
  const records = db
    .select({
      employeeId: attendance.employeeId,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      source: attendance.source,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .where(and(
      sql`date(${attendance.serverTimestamp}) >= ${firstDay}`,
      sql`date(${attendance.serverTimestamp}) <= ${lastDayStr}`,
    ))
    .all();

  const leaves = db
    .select({
      employeeId: leaveRequests.employeeId,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
    })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.fromDate, lastDayStr),
      gte(leaveRequests.toDate, firstDay),
    ))
    .all();

  const holidayCal = getHolidayCalendar(firstDay, lastDayStr);
  const holidayDates = holidayCal.dates;

  // Total working days in the full month (for per-day rate calculation)
  let totalMonthWorkingDays = 0;
  // Working days elapsed so far (for attendance/absent calculations)
  let workingDays = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${month}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(year, mon - 1, d).getDay();
    if (dayOfWeek !== 0 && !holidayDates.has(dateStr)) {
      totalMonthWorkingDays++;
      if (dateStr <= today) workingDays++;
    }
  }

  // Group records by employee + date (store all punches for multi-session)
  type DayEntry = { punchIn: string | null; punchOut: string | null; source: string; photoKey: string; allPunches: { punchType: string; serverTimestamp: string }[] };
  const empDayMap = new Map<string, Map<string, DayEntry>>();

  for (const r of records) {
    const dateStr = r.serverTimestamp.slice(0, 10);
    const empKey = r.employeeId;
    if (!empDayMap.has(empKey)) empDayMap.set(empKey, new Map());
    const dayMap = empDayMap.get(empKey)!;
    if (!dayMap.has(dateStr)) dayMap.set(dateStr, { punchIn: null, punchOut: null, source: r.source, photoKey: r.photoKey, allPunches: [] });
    const entry = dayMap.get(dateStr)!;
    entry.allPunches.push({ punchType: r.punchType, serverTimestamp: r.serverTimestamp });
    if (r.punchType === "IN") {
      // Keep earliest IN
      if (!entry.punchIn || r.serverTimestamp < entry.punchIn) {
        entry.punchIn = r.serverTimestamp;
        entry.source = r.source;
        entry.photoKey = r.photoKey;
      }
    } else if (r.punchType === "OUT") {
      // Keep latest OUT
      if (!entry.punchOut || r.serverTimestamp > entry.punchOut) {
        entry.punchOut = r.serverTimestamp;
      }
    }
  }

  const rulesByEmp = getEffectiveRulesBatch(allEmployees.map((e) => e.id));

  const report = allEmployees.map((emp) => {
    const dayMap = empDayMap.get(emp.id) || new Map<string, DayEntry>();
    const [startH, startM] = emp.workStartTime.split(":").map(Number);
    const empRules = rulesByEmp.get(emp.id)!;
    const graceMin = startH * 60 + startM + empRules.grace_period;

    let presentDays = 0;
    let lateDays = 0;
    let uhDays = 0;
    let weeklyOffs = 0;
    let holidayCount = 0;
    let unpaidHolidayDays = 0;
    let totalWorkedMinutes = 0;
    let sundayWorkedDays = 0;
    let shortDays = 0;
    let halfDays = 0;
    const halfDayMinutes = empRules.minimum_hours_for_half_day * 60;
    const fullDayMinutes = empRules.minimum_hours_for_full_day * 60;

    // Build daily details
    type DayDetail = {
      date: string;
      punchIn: string | null;
      punchOut: string | null;
      durationMinutes: number | null;
      breakMinutes: number | null;
      status: string;
      sessions?: SessionInfo[];
    };
    const dailyDetails: DayDetail[] = [];

    // Build set of leave dates for this employee
    const empLeaveDates = new Set<string>();
    for (const leave of leaves) {
      if (leave.employeeId !== emp.id) continue;
      const from = new Date(Math.max(new Date(leave.fromDate).getTime(), new Date(firstDay).getTime()));
      const to = new Date(Math.min(new Date(leave.toDate).getTime(), new Date(lastDayStr).getTime()));
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0) empLeaveDates.add(d.toISOString().slice(0, 10));
      }
    }

    // Iterate every day of the month
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${month}-${String(d).padStart(2, "0")}`;
      if (dateStr > today) break;
      const dayOfWeek = new Date(year, mon - 1, d).getDay();
      if (dayOfWeek === 0) {
        weeklyOffs++;
        // Check if employee worked on this Sunday (has both IN and OUT)
        const sundayEntry = dayMap.get(dateStr);
        if (sundayEntry?.punchIn && sundayEntry?.punchOut) {
          sundayWorkedDays++;
          const sorted = [...sundayEntry.allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
          const dur = calculateTotalDuration(sorted);
          const brk = calculateBreakDuration(sorted);
          dailyDetails.push({
            date: dateStr,
            punchIn: sundayEntry.punchIn,
            punchOut: sundayEntry.punchOut,
            durationMinutes: dur > 0 ? dur : null,
            breakMinutes: brk > 0 ? brk : null,
            status: "sunday-worked",
            sessions: buildSessions(sundayEntry.allPunches),
          });
        } else {
          dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "sunday" });
        }
        continue;
      }
      const holiday = holidayCal.byDate.get(dateStr);
      if (holiday) {
        // Unpaid only if the employee isn't paid for it and didn't work that day
        const holidayEntry = dayMap.get(dateStr);
        const workedHoliday = !!(holidayEntry?.punchIn && holidayEntry?.punchOut);
        if (emp.flexibleHours || workedHoliday || holidayCal.isPaidFor(holiday, emp)) {
          holidayCount++;
          dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "holiday" });
        } else {
          unpaidHolidayDays++;
          dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "uh" });
        }
        continue;
      }
      if (empLeaveDates.has(dateStr)) {
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "leave" });
        continue;
      }

      const entry = dayMap.get(dateStr);
      if (!entry) {
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "absent" });
        continue;
      }

      const isUH = entry.source === "admin" && entry.photoKey === "admin/unpaid-holiday";
      if (isUH) {
        uhDays++;
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "uh" });
        continue;
      }

      // If punch-out is missing, treat as absent (incomplete record)
      if (!entry.punchOut) {
        dailyDetails.push({ date: dateStr, punchIn: entry.punchIn, punchOut: null, durationMinutes: null, breakMinutes: null, status: "absent", sessions: buildSessions(entry.allPunches) });
        continue;
      }

      let durationMinutes: number | null = null;
      let breakMinutes: number | null = null;
      const sorted = [...entry.allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
      const totalDur = calculateTotalDuration(sorted);
      if (totalDur > 0) {
        durationMinutes = totalDur;
        totalWorkedMinutes += durationMinutes;
      }
      const brk = calculateBreakDuration(sorted);
      if (brk > 0) breakMinutes = brk;

      // Three-tier check: short-day / half-day / present (only for past completed days)
      // Skip for flexible-hours employees
      if (!emp.flexibleHours && dateStr < today) {
        if (totalDur < halfDayMinutes) {
          shortDays++;
          dailyDetails.push({ date: dateStr, punchIn: entry.punchIn, punchOut: entry.punchOut, durationMinutes, breakMinutes, status: "short-day", sessions: buildSessions(entry.allPunches) });
          continue;
        }
        if (totalDur < fullDayMinutes) {
          halfDays++;
          dailyDetails.push({ date: dateStr, punchIn: entry.punchIn, punchOut: entry.punchOut, durationMinutes, breakMinutes, status: "half-day", sessions: buildSessions(entry.allPunches) });
          continue;
        }
      }

      presentDays++;

      // Check late (skip for flexible-hours employees)
      let isLate = false;
      if (!emp.flexibleHours && entry.punchIn) {
        const ts = entry.punchIn;
        const punchDate = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
        const punchMin = ((punchDate.getUTCHours() + 5) * 60 + punchDate.getUTCMinutes() + 30) % (24 * 60);
        if (punchMin > graceMin) { lateDays++; isLate = true; }
      }

      dailyDetails.push({
        date: dateStr,
        punchIn: entry.punchIn,
        punchOut: entry.punchOut,
        durationMinutes,
        breakMinutes,
        status: isLate ? "late" : "present",
        sessions: buildSessions(entry.allPunches),
      });
    }

    const leaveDays = empLeaveDates.size;
    const countableDays = workingDays - uhDays - leaveDays;
    const absentDays = Math.max(0, countableDays - presentDays - halfDays);
    // Late-to-absent conversion: every 3 lates = 0.5 day deduction (half-day steps)
    const lateDeductionDays = Math.floor(lateDays / 3) * 0.5;
    const halfDayDeduction = halfDays * 0.5;
    const attendancePct = countableDays > 0 ? Math.round(((presentDays + halfDays * 0.5) / countableDays) * 100) : 100;

    // Salary calculations (per-day rate uses total calendar days in month, including Sundays)
    const totalDeductionDays = absentDays + halfDayDeduction + lateDeductionDays + unpaidHolidayDays;
    const perDayRate = Math.round(emp.monthlySalary / lastDay);
    const deduction = Math.round(perDayRate * totalDeductionDays);
    const sundayBonus = sundayWorkedDays * perDayRate;
    const netPay = emp.monthlySalary - deduction + sundayBonus;

    return {
      id: emp.id,
      name: emp.name,
      shift: `${emp.workStartTime} - ${emp.workEndTime}`,
      jobRole: emp.jobRole,
      office: emp.office,
      monthlySalary: emp.monthlySalary,
      createdAt: emp.createdAt,
      isFlexible: emp.flexibleHours,
      hourlyRate: emp.hourlyRate,
      presentDays,
      absentDays,
      halfDays,
      shortDays,
      lateAbsentDays: lateDeductionDays,
      lateDays,
      leaveDays,
      uhDays: uhDays + unpaidHolidayDays,
      unpaidHolidayDays,
      weeklyOffs,
      holidayCount,
      attendancePct,
      totalWorkedMinutes,
      sundayWorkedDays,
      sundayBonus,
      perDayRate,
      deduction,
      netPay,
      dailyDetails,
    };
  });

  return Response.json({ month, workingDays: totalMonthWorkingDays, employees: report });
}
