import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests, holidays } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { getEffectiveRulesBatch } from "../../../../lib/rules";
import { calculateTotalDuration, calculateBreakDuration } from "../../../../lib/time-utils";

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
      createdAt: employees.createdAt,
    })
    .from(employees)
    .where(eq(employees.active, true))
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

  const holidayRecords = db
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(
      gte(holidays.date, firstDay),
      lte(holidays.date, lastDayStr),
    ))
    .all();
  const holidayDates = new Set(holidayRecords.map((h) => h.date));

  let workingDays = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${month}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(year, mon - 1, d).getDay();
    if (dayOfWeek !== 0 && !holidayDates.has(dateStr) && dateStr <= today) {
      workingDays++;
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
    let totalWorkedMinutes = 0;

    // Build daily details
    type DayDetail = {
      date: string;
      punchIn: string | null;
      punchOut: string | null;
      durationMinutes: number | null;
      breakMinutes: number | null;
      status: string;
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
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "sunday" });
        continue;
      }
      if (holidayDates.has(dateStr)) {
        holidayCount++;
        dailyDetails.push({ date: dateStr, punchIn: null, punchOut: null, durationMinutes: null, breakMinutes: null, status: "holiday" });
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

      presentDays++;
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

      // Check late
      let isLate = false;
      if (entry.punchIn) {
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
      });
    }

    const leaveDays = empLeaveDates.size;
    const countableDays = workingDays - uhDays - leaveDays;
    const absentDays = Math.max(0, countableDays - presentDays);
    // Late-to-absent conversion: e.g. every 3 lates = 1 extra absent day
    const lateAbsentDays = empRules.late_to_absent_count > 0
      ? Math.floor(lateDays / empRules.late_to_absent_count)
      : 0;
    const attendancePct = countableDays > 0 ? Math.round((presentDays / countableDays) * 100) : 100;

    // Salary calculations (same formulas as payroll route)
    const totalDeductionDays = absentDays + lateAbsentDays;
    const perDayRate = workingDays > 0 ? Math.round(emp.monthlySalary / workingDays) : 0;
    const deduction = Math.round((workingDays > 0 ? emp.monthlySalary / workingDays : 0) * totalDeductionDays);
    const netPay = emp.monthlySalary - deduction;

    return {
      id: emp.id,
      name: emp.name,
      shift: `${emp.workStartTime} - ${emp.workEndTime}`,
      jobRole: emp.jobRole,
      office: emp.office,
      monthlySalary: emp.monthlySalary,
      createdAt: emp.createdAt,
      presentDays,
      absentDays,
      lateAbsentDays,
      lateDays,
      leaveDays,
      uhDays,
      weeklyOffs,
      holidayCount,
      attendancePct,
      totalWorkedMinutes,
      perDayRate,
      deduction,
      netPay,
      dailyDetails,
    };
  });

  return Response.json({ month, workingDays, employees: report });
}
