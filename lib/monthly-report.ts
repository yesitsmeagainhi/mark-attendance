/**
 * Month attendance + salary report for every active employee.
 *
 * Shared by the admin Reports API and payslip publishing, so a payslip always
 * matches what admins see in Reports.
 */
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { attendance, employees, leaveRequests } from "../db/schema";
import { getAppliedRulesBatch, getEffectiveRulesBatch } from "./rules";
import { calculateTotalDuration, calculateBreakDuration } from "./time-utils";
import { getHolidayCalendar } from "./holidays";
import { dayOfWeek, eachDate, resolveWeekOffs, weekBounds, type DayKind } from "./week-off";
import { computeMonthlySalary, salaryLines, dailyOvertimeMinutes, isLateHalfDay, leaveUsedBeforeMonth, shiftLengthMinutes, splitLeaveDays, weekOffWorkedCredit as weekOffCreditFor, type LeaveType } from "./pay-rules";

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

export type MonthlyReport = ReturnType<typeof buildMonthlyReport>;

/** `month` is "YYYY-MM". */
export function buildMonthlyReport(month: string) {
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
      sql`date(${attendance.serverTimestamp}) >= ${range.start}`,
      sql`date(${attendance.serverTimestamp}) <= ${range.end}`,
    ))
    .all();

  const leaves = db
    .select({
      employeeId: leaveRequests.employeeId,
      leaveType: leaveRequests.leaveType,
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

  const holidayCal = getHolidayCalendar(range.start, range.end);

  // Nominal working days in the full month (one week-off per week) — for the report header
  const totalMonthWorkingDays = monthDates.filter((d) => dayOfWeek(d) !== 0 && !holidayCal.byDate.has(d)).length;
  const today = new Date().toISOString().slice(0, 10);

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
  const appliedRulesByEmp = getAppliedRulesBatch(allEmployees.map((e) => e.id));
  const leaveUsedByEmp = leaveUsedBeforeMonth(allEmployees.map((e) => e.id), firstDay);

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
    let weekOffWorkedDays = 0;
    let weekOffWorkedCredit = 0; // days of extra pay (1 full / 0.5 half each)
    let weekOffWorkedHalfDays = 0;
    let shortDays = 0;
    let halfDays = 0;
    let lateHalfDays = 0;
    let missedPunchOutDays = 0;
    let missedPunchInDays = 0;
    let overtimeMinutes = 0;
    const shiftMinutes = shiftLengthMinutes(emp.workStartTime, emp.workEndTime);
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
      overtimeMinutes?: number;
      /** Half day because of coming in late (late_half_day_minutes rule) */
      lateHalfDay?: boolean;
      /** Approved leave days: sick / casual / earned */
      leaveType?: LeaveType;
      sessions?: SessionInfo[];
    };
    const dailyDetails: DayDetail[] = [];

    // Build set of leave dates for this employee (full weeks, for week-off resolution)
    const leaveDates = new Set<string>();
    const leaveTypeByDate = new Map<string, LeaveType>();
    for (const leave of leaves) {
      if (leave.employeeId !== emp.id) continue;
      const from = leave.fromDate > range.start ? leave.fromDate : range.start;
      const to = leave.toDate < range.end ? leave.toDate : range.end;
      for (const d of eachDate(from, to)) {
        leaveDates.add(d);
        if (!leaveTypeByDate.has(d)) leaveTypeByDate.set(d, leave.leaveType);
      }
    }

    const isUHEntry = (entry: DayEntry) => entry.source === "admin" && entry.photoKey === "admin/unpaid-holiday";

    const { weekOff, extraPay } = resolveWeekOffs(firstDay, lastDayStr, (date): DayKind => {
      if (holidayCal.byDate.has(date)) return "holiday";
      if (leaveDates.has(date)) return "excused";
      const entry = dayMap.get(date);
      if (entry && isUHEntry(entry)) return "excused";
      if (entry?.punchIn && (entry.punchOut || date === today)) return "worked";
      return "off";
    }, today);

    // Leave days in this month (week-offs and holidays don't consume leave)
    const empLeaveDates = new Set(monthDates.filter((d) => leaveDates.has(d) && !holidayCal.byDate.has(d) && !weekOff.has(d)));
    // Working days elapsed so far for this employee (for attendance/absent calculations)
    const workingDays = monthDates.filter((d) => d <= today && !holidayCal.byDate.has(d) && !weekOff.has(d) && !extraPay.has(d)).length;

    // Iterate every day of the month
    for (const dateStr of monthDates) {
      if (dateStr > today) break;
      if (weekOff.has(dateStr)) {
        weeklyOffs++;
        // Never hide punches: a stray punch on the week-off day is still shown
        const woStray = dayMap.get(dateStr);
        dailyDetails.push({ date: dateStr, punchIn: woStray?.punchIn ?? null, punchOut: woStray?.punchOut ?? null, durationMinutes: null, breakMinutes: null, status: "week-off" });
        continue;
      }
      if (extraPay.has(dateStr)) {
        // Worked every day of the week — this day earns extra pay
        const woEntry = dayMap.get(dateStr)!;
        weekOffWorkedDays++;
        const sorted = [...woEntry.allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
        const dur = calculateTotalDuration(sorted);
        // Extra pay: full day's pay for a full day's work, half for a half day
        const credit = weekOffCreditFor(dur, empRules);
        weekOffWorkedCredit += credit;
        if (credit === 0.5) weekOffWorkedHalfDays++;
        const brk = calculateBreakDuration(sorted);
        if (emp.flexibleHours && dur > 0) totalWorkedMinutes += dur;
        const woOvertime = !emp.flexibleHours && dateStr < today ? dailyOvertimeMinutes(dur, brk, shiftMinutes, empRules) : 0;
        overtimeMinutes += woOvertime;
        dailyDetails.push({
          date: dateStr,
          punchIn: woEntry.punchIn,
          punchOut: woEntry.punchOut,
          durationMinutes: dur > 0 ? dur : null,
          breakMinutes: brk > 0 ? brk : null,
          status: "weekoff-worked",
          ...(woOvertime > 0 ? { overtimeMinutes: woOvertime } : {}),
          sessions: buildSessions(woEntry.allPunches),
        });
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
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "leave", leaveType: leaveTypeByDate.get(dateStr) ?? "casual" });
        continue;
      }

      const entry = dayMap.get(dateStr);
      if (!entry) {
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "absent" });
        continue;
      }

      if (isUHEntry(entry)) {
        uhDays++;
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "uh" });
        continue;
      }

      // Punched out but never in (forgot to punch in, miss-punch not approved yet):
      // paid as absent like before, but tagged so HR can tell it apart
      if (!entry.punchIn) {
        if (dateStr < today) missedPunchInDays++;
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: entry.punchOut, durationMinutes: null, breakMinutes: null, status: "missed-in", sessions: buildSessions(entry.allPunches) });
        continue;
      }

      // If punch-out is missing, pay it as absent (incomplete record), but tag it so HR
      // can tell a forgotten/failed punch-out apart from a real absence and fix it
      if (!entry.punchOut) {
        if (dateStr < today) missedPunchOutDays++;
        dailyDetails.push({ date: dateStr, punchIn: entry.punchIn, punchOut: null, durationMinutes: null, breakMinutes: null, status: dateStr < today ? "missed-out" : "in-progress", sessions: buildSessions(entry.allPunches) });
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
        // Came in too late: a half day (instead of a late mark)
        if (isLateHalfDay(entry.punchIn, emp.workStartTime, empRules)) {
          halfDays++;
          lateHalfDays++;
          dailyDetails.push({ date: dateStr, punchIn: entry.punchIn, punchOut: entry.punchOut, durationMinutes, breakMinutes, status: "half-day", lateHalfDay: true, sessions: buildSessions(entry.allPunches) });
          continue;
        }
        if (totalDur < fullDayMinutes) {
          halfDays++;
          dailyDetails.push({ date: dateStr, punchIn: entry.punchIn, punchOut: entry.punchOut, durationMinutes, breakMinutes, status: "half-day", sessions: buildSessions(entry.allPunches) });
          continue;
        }
      }

      presentDays++;
      const dayOvertime = !emp.flexibleHours && dateStr < today ? dailyOvertimeMinutes(totalDur, brk, shiftMinutes, empRules) : 0;
      overtimeMinutes += dayOvertime;

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
        ...(dayOvertime > 0 ? { overtimeMinutes: dayOvertime } : {}),
        sessions: buildSessions(entry.allPunches),
      });
    }

    const leaveDays = empLeaveDates.size;
    const countableDays = workingDays - uhDays - leaveDays;
    const absentDays = Math.max(0, countableDays - presentDays - halfDays);
    const attendancePct = countableDays > 0 ? Math.round(((presentDays + halfDays * 0.5) / countableDays) * 100) : 100;

    // Salary: leave policy decides which leave days are paid, then the shared rules engine
    const leaveSplit = splitLeaveDays([...empLeaveDates], (d) => leaveTypeByDate.get(d) ?? "casual", leaveUsedByEmp.get(emp.id)!, empRules);
    for (const day of dailyDetails) {
      if (day.status === "leave" && leaveSplit.unpaidDates.has(day.date)) day.status = "unpaid-leave";
    }
    // Every approved leave day in the month (week-offs and holidays excluded), paid or not
    const leaveList = [...empLeaveDates].sort().map((date) => ({
      date,
      type: leaveTypeByDate.get(date) ?? ("casual" as LeaveType),
      paid: !leaveSplit.unpaidDates.has(date),
    }));
    const salaryInput = {
      monthlySalary: emp.monthlySalary,
      daysInMonth: lastDay,
      shiftMinutes,
      rules: empRules,
      absentDays,
      halfDays,
      lateHalfDays,
      lateDays,
      unpaidHolidayDays,
      unpaidLeaveDays: leaveSplit.unpaid,
      weekOffWorkedDays,
      weekOffWorkedCredit,
      weekOffWorkedHalfDays,
      overtimeMinutes,
    };
    const pay = computeMonthlySalary(salaryInput);

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
      missedPunchOutDays,
      missedPunchInDays,
      halfDays,
      shortDays,
      lateAbsentDays: pay.lateDeductionDays,
      lateDays,
      lateFine: pay.lateFine,
      leaveDays,
      unpaidLeaveDays: leaveSplit.unpaid,
      paidLeaveDays: leaveDays - leaveSplit.unpaid,
      leaveList,
      uhDays: uhDays + unpaidHolidayDays,
      unpaidHolidayDays,
      weeklyOffs,
      holidayCount,
      attendancePct,
      totalWorkedMinutes,
      weekOffWorkedDays,
      weekOffWorkedCredit,
      weekOffBonus: pay.weekOffBonus,
      overtimeMinutes: pay.overtimeMinutes,
      overtimePay: pay.overtimePay,
      perDayRate: pay.perDayRate,
      // Hourly (flex) staff are paid hours x rate, so day-based pay rules don't apply
      salaryLines: !emp.flexibleHours && emp.monthlySalary > 0 ? salaryLines(salaryInput, pay) : [],
      rulesApplied: appliedRulesByEmp.get(emp.id) ?? [],
      deduction: pay.deduction,
      netPay: pay.netPay,
      dailyDetails,
    };
  });


  return { month, workingDays: totalMonthWorkingDays, employees: report };
}
