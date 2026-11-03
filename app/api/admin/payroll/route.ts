import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { getEffectiveRulesBatch } from "../../../../lib/rules";
import { calculateTotalDuration } from "../../../../lib/time-utils";
import { getHolidayCalendar } from "../../../../lib/holidays";
import { dayOfWeek, eachDate, resolveWeekOffs, weekBounds, type DayKind } from "../../../../lib/week-off";

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

  // Week-offs rotate, so load whole Mon–Sun weeks around the month
  const range = weekBounds(firstDay, lastDayStr);
  const monthDates = eachDate(firstDay, lastDayStr);
  const holidayCal = getHolidayCalendar(range.start, range.end);
  const monthHolidays = monthDates.filter((d) => holidayCal.byDate.has(d)).length;

  // Nominal working days (one week-off per week) — per-employee figures are computed below
  const workingDays = monthDates.filter((d) => dayOfWeek(d) !== 0 && !holidayCal.byDate.has(d)).length;

  // Get all active employees
  const allEmployees = db
    .select({
      id: employees.id,
      name: employees.name,
      monthlySalary: employees.monthlySalary,
      hourlyRate: employees.hourlyRate,
      workStartTime: employees.workStartTime,
      flexibleHours: employees.flexibleHours,
      paidHolidays: employees.paidHolidays,
    })
    .from(employees)
    .where(and(eq(employees.active, true), sql`${employees.role} != 'admin'`))
    .orderBy(employees.name)
    .all();

  // Get ALL attendance records (IN + OUT) for the month
  const allRecords = db
    .select({
      employeeId: attendance.employeeId,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      source: attendance.source,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .where(and(
      sql`date(${attendance.serverTimestamp}) >= ${range.start}`,
      sql`date(${attendance.serverTimestamp}) <= ${range.end}`,
    ))
    .all();

  // Group all records by employee + date
  type DayEntry = { punchIn: string | null; punchOut: string | null; source: string; photoKey: string; inRecords: typeof allRecords; allPunches: { punchType: string; serverTimestamp: string }[] };
  const empDayMap = new Map<string, Map<string, DayEntry>>();
  for (const r of allRecords) {
    const dateStr = r.serverTimestamp.slice(0, 10);
    if (!empDayMap.has(r.employeeId)) empDayMap.set(r.employeeId, new Map());
    const dayMap = empDayMap.get(r.employeeId)!;
    if (!dayMap.has(dateStr)) dayMap.set(dateStr, { punchIn: null, punchOut: null, source: r.source, photoKey: r.photoKey, inRecords: [], allPunches: [] });
    const entry = dayMap.get(dateStr)!;
    entry.allPunches.push({ punchType: r.punchType, serverTimestamp: r.serverTimestamp });
    if (r.punchType === "IN") {
      entry.inRecords.push(r);
      if (!entry.punchIn || r.serverTimestamp < entry.punchIn) {
        entry.punchIn = r.serverTimestamp;
        entry.source = r.source;
        entry.photoKey = r.photoKey;
      }
    } else if (r.punchType === "OUT") {
      if (!entry.punchOut || r.serverTimestamp > entry.punchOut) {
        entry.punchOut = r.serverTimestamp;
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Get approved leaves
  const leaves = db
    .select({
      employeeId: leaveRequests.employeeId,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
    })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.fromDate, range.end),
      gte(leaveRequests.toDate, range.start),
    ))
    .all();

  const rulesByEmp = getEffectiveRulesBatch(allEmployees.map((e) => e.id));

  const payroll = allEmployees.map((emp) => {
    const dayMap = empDayMap.get(emp.id) || new Map<string, DayEntry>();
    const [startH, startM] = emp.workStartTime.split(":").map(Number);
    const empRules = rulesByEmp.get(emp.id)!;
    const graceMin = startH * 60 + startM + empRules.grace_period;

    const punchDates = new Set<string>();
    let lateDays = 0;
    let uhDays = 0;
    let weekOffWorkedDays = 0;
    let unpaidHolidayDays = 0;
    let shortDays = 0;
    let halfDays = 0;
    let totalMinutesWorked = 0; // for flex/hourly employees
    const halfDayMinutes = empRules.minimum_hours_for_half_day * 60;
    const fullDayMinutes = empRules.minimum_hours_for_full_day * 60;

    const leaveDates = new Set<string>();
    for (const leave of leaves) {
      if (leave.employeeId !== emp.id) continue;
      const from = leave.fromDate > range.start ? leave.fromDate : range.start;
      const to = leave.toDate < range.end ? leave.toDate : range.end;
      for (const d of eachDate(from, to)) leaveDates.add(d);
    }

    const isUHEntry = (entry: DayEntry) =>
      !entry.inRecords.some((r) => r.source !== "admin") && entry.photoKey === "admin/unpaid-holiday";

    const { weekOff, extraPay } = resolveWeekOffs(firstDay, lastDayStr, (date): DayKind => {
      if (holidayCal.byDate.has(date)) return "holiday";
      if (leaveDates.has(date)) return "excused";
      const entry = dayMap.get(date);
      if (entry && isUHEntry(entry)) return "excused";
      if (entry?.punchIn && (entry.punchOut || date === today)) return "worked";
      return "off";
    }, today);

    // Days this employee was expected to work: whole month minus holidays and their week-offs
    const empWorkingDays = monthDates.filter((d) => !holidayCal.byDate.has(d) && !weekOff.has(d) && !extraPay.has(d)).length;
    const leaveDays = monthDates.filter((d) => leaveDates.has(d) && !holidayCal.byDate.has(d) && !weekOff.has(d)).length;

    // Iterate every day of the month
    for (const dateStr of monthDates) {
      if (dateStr > today) break;

      const entry = dayMap.get(dateStr);

      // Holiday — paid days are skipped; unpaid ones (not worked) are deducted
      const holiday = holidayCal.byDate.get(dateStr);
      if (holiday) {
        const workedHoliday = !!(entry?.punchIn && entry?.punchOut);
        if (!emp.flexibleHours && !workedHoliday && !holidayCal.isPaidFor(holiday, emp)) unpaidHolidayDays++;
        continue;
      }

      // Week-off taken — nothing to count
      if (weekOff.has(dateStr)) continue;

      // Worked every day of the week — this day earns extra pay
      if (extraPay.has(dateStr)) {
        weekOffWorkedDays++;
        if (emp.flexibleHours && entry) {
          const sorted = [...entry.allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
          totalMinutesWorked += calculateTotalDuration(sorted);
        }
        continue;
      }

      // No punch record at all
      if (!entry) continue;

      // Check for UH
      if (isUHEntry(entry)) { uhDays++; continue; }

      // If punch-out is missing, treat as absent/incomplete (no hours counted)
      if (!entry.punchOut) continue;

      // Accumulate hours for flex/hourly employees
      if (emp.flexibleHours && entry.allPunches.length > 0) {
        const sorted = [...entry.allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
        totalMinutesWorked += calculateTotalDuration(sorted);
      }

      // Three-tier check: short-day / half-day / present
      // Skip for flexible-hours employees
      if (!emp.flexibleHours && dateStr < today) {
        const sorted = [...entry.allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
        const totalDur = calculateTotalDuration(sorted);
        if (totalDur < halfDayMinutes) {
          shortDays++;
          continue;
        }
        if (totalDur < fullDayMinutes) {
          halfDays++;
          continue;
        }
      }

      punchDates.add(dateStr);

      // Use selfie record for late calculation when available
      // Skip for flexible-hours employees
      if (!emp.flexibleHours) {
        const bestPunch = entry.inRecords.find((r) => r.source !== "admin") || entry.inRecords[0];
        if (bestPunch) {
          const ts = bestPunch.serverTimestamp;
          const punchDate = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
          const punchMin = ((punchDate.getUTCHours() + 5) * 60 + punchDate.getUTCMinutes() + 30) % (24 * 60);
          if (punchMin > graceMin) lateDays++;
        }
      }
    }

    const presentDays = punchDates.size;

    // Flex/lecture employees: pay = total hours worked × hourly rate
    if (emp.flexibleHours) {
      const totalHours = Math.round((totalMinutesWorked / 60) * 100) / 100;
      const netPay = Math.round(totalHours * emp.hourlyRate);
      return {
        id: emp.id,
        name: emp.name,
        isFlexible: true,
        hourlyRate: emp.hourlyRate,
        totalHours,
        totalMinutes: totalMinutesWorked,
        leaveDays,
        netPay,
        // Unused fields set to 0 for type consistency
        monthlySalary: 0,
        workingDays: empWorkingDays,
        presentDays,
        absentDays: 0,
        halfDays: 0,
        lateAbsentDays: 0,
        lateDays: 0,
        weekOffWorkedDays,
        weekOffBonus: 0,
        deduction: 0,
      };
    }

    const effectiveWorkDays = empWorkingDays - uhDays - leaveDays;
    const absentDays = Math.max(0, effectiveWorkDays - presentDays - halfDays);
    // Late-to-absent conversion: every 3 lates = 0.5 day deduction (half-day steps)
    const lateDeductionDays = Math.floor(lateDays / 3) * 0.5;
    const halfDayDeduction = halfDays * 0.5;
    const totalDeductionDays = absentDays + halfDayDeduction + lateDeductionDays + unpaidHolidayDays;
    // Per-day rate uses total calendar days in month (including week-offs)
    const perDayRate = Math.round(emp.monthlySalary / lastDay);
    const deduction = Math.round(perDayRate * totalDeductionDays);
    const weekOffBonus = Math.round(weekOffWorkedDays * perDayRate);
    const netPay = emp.monthlySalary - deduction + weekOffBonus;

    return {
      id: emp.id,
      name: emp.name,
      isFlexible: false,
      hourlyRate: 0,
      totalHours: 0,
      totalMinutes: 0,
      monthlySalary: emp.monthlySalary,
      workingDays: empWorkingDays,
      presentDays,
      absentDays,
      halfDays,
      lateAbsentDays: lateDeductionDays,
      lateDays,
      leaveDays,
      unpaidHolidayDays,
      weekOffWorkedDays,
      weekOffBonus,
      deduction,
      netPay,
    };
  });

  return Response.json({
    month,
    workingDays,
    totalHolidays: monthHolidays,
    employees: payroll,
  });
}
