import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests, holidays } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { getEffectiveRulesBatch } from "../../../../lib/rules";
import { calculateTotalDuration } from "../../../../lib/time-utils";

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

  // Calculate working days (exclude Sundays and holidays)
  const holidayRecords = db
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(gte(holidays.date, firstDay), lte(holidays.date, lastDayStr)))
    .all();
  const holidayDates = new Set(holidayRecords.map((h) => h.date));

  let workingDays = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${month}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(year, mon - 1, d).getDay();
    if (dayOfWeek !== 0 && !holidayDates.has(dateStr)) workingDays++;
  }

  // Get all active employees
  const allEmployees = db
    .select({
      id: employees.id,
      name: employees.name,
      monthlySalary: employees.monthlySalary,
      workStartTime: employees.workStartTime,
    })
    .from(employees)
    .where(eq(employees.active, true))
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
      sql`date(${attendance.serverTimestamp}) >= ${firstDay}`,
      sql`date(${attendance.serverTimestamp}) <= ${lastDayStr}`,
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
      lte(leaveRequests.fromDate, lastDayStr),
      gte(leaveRequests.toDate, firstDay),
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
    let sundayWorkedDays = 0;
    let shortDays = 0;
    let halfDays = 0;
    const halfDayMinutes = empRules.minimum_hours_for_half_day * 60;
    const fullDayMinutes = empRules.minimum_hours_for_full_day * 60;

    // Count leave days
    let leaveDays = 0;
    for (const leave of leaves) {
      if (leave.employeeId !== emp.id) continue;
      const from = new Date(Math.max(new Date(leave.fromDate).getTime(), new Date(firstDay).getTime()));
      const to = new Date(Math.min(new Date(leave.toDate).getTime(), new Date(lastDayStr).getTime()));
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0) leaveDays++;
      }
    }

    // Iterate every day of the month
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${month}-${String(d).padStart(2, "0")}`;
      if (dateStr > today) break;
      const dayOfWeek = new Date(year, mon - 1, d).getDay();

      const entry = dayMap.get(dateStr);

      // Sunday — check if employee worked (has both IN and OUT)
      if (dayOfWeek === 0) {
        if (entry?.punchIn && entry?.punchOut) {
          sundayWorkedDays++;
        }
        continue;
      }

      // Holiday — skip
      if (holidayDates.has(dateStr)) continue;

      // No punch record at all
      if (!entry) continue;

      // Check for UH
      const hasSelfie = entry.inRecords.some((r) => r.source !== "admin");
      const isUH = !hasSelfie && entry.photoKey === "admin/unpaid-holiday";
      if (isUH) { uhDays++; continue; }

      // If punch-out is missing, treat as absent (incomplete record)
      if (!entry.punchOut) continue;

      // Three-tier check: short-day / half-day / present
      if (dateStr < today) {
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
      const bestPunch = entry.inRecords.find((r) => r.source !== "admin") || entry.inRecords[0];
      if (bestPunch) {
        const ts = bestPunch.serverTimestamp;
        const punchDate = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
        const punchMin = ((punchDate.getUTCHours() + 5) * 60 + punchDate.getUTCMinutes() + 30) % (24 * 60);
        if (punchMin > graceMin) lateDays++;
      }
    }

    const presentDays = punchDates.size;

    const effectiveWorkDays = workingDays - uhDays - leaveDays;
    const absentDays = Math.max(0, effectiveWorkDays - presentDays - halfDays);
    // Late-to-absent conversion: every 3 lates = 0.5 day deduction (half-day steps)
    const lateDeductionDays = Math.floor(lateDays / 3) * 0.5;
    const halfDayDeduction = halfDays * 0.5;
    const totalDeductionDays = absentDays + halfDayDeduction + lateDeductionDays;
    const perDayRate = workingDays > 0 ? emp.monthlySalary / workingDays : 0;
    const deduction = Math.round(perDayRate * totalDeductionDays);
    const sundayBonus = Math.round(sundayWorkedDays * perDayRate);
    const netPay = emp.monthlySalary - deduction + sundayBonus;

    return {
      id: emp.id,
      name: emp.name,
      monthlySalary: emp.monthlySalary,
      workingDays,
      presentDays,
      absentDays,
      halfDays,
      lateAbsentDays: lateDeductionDays,
      lateDays,
      leaveDays,
      sundayWorkedDays,
      sundayBonus,
      deduction,
      netPay,
    };
  });

  return Response.json({
    month,
    workingDays,
    totalHolidays: holidayDates.size,
    employees: payroll,
  });
}
