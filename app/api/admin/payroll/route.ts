import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests, holidays } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";

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

  // Get punch-in records for the month
  const punchRecords = db
    .select({
      employeeId: attendance.employeeId,
      serverTimestamp: attendance.serverTimestamp,
      source: attendance.source,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .where(and(
      eq(attendance.punchType, "IN"),
      sql`date(${attendance.serverTimestamp}) >= ${firstDay}`,
      sql`date(${attendance.serverTimestamp}) <= ${lastDayStr}`,
    ))
    .all();

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

  const payroll = allEmployees.map((emp) => {
    const empPunches = punchRecords.filter((r) => r.employeeId === emp.id);
    const [startH, startM] = emp.workStartTime.split(":").map(Number);
    const graceMin = startH * 60 + startM + 15;

    // Group records by date to handle selfie + admin overlaps correctly
    const byDate = new Map<string, typeof empPunches>();
    for (const r of empPunches) {
      const d = r.serverTimestamp.slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(r);
    }

    const punchDates = new Set<string>();
    let lateDays = 0;
    let uhDays = 0;

    for (const [dateStr, dayRecords] of byDate) {
      // If a selfie-based punch exists, the employee actually came to work —
      // ignore any admin UH record for that date
      const hasSelfie = dayRecords.some((r) => r.source !== "admin");
      const isUH = !hasSelfie && dayRecords.some((r) => r.photoKey === "admin/unpaid-holiday");
      if (isUH) { uhDays++; continue; }

      punchDates.add(dateStr);

      // Use selfie record for late calculation when available
      const bestPunch = dayRecords.find((r) => r.source !== "admin") || dayRecords[0];
      const ts = bestPunch.serverTimestamp;
      const punchDate = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
      const punchMin = ((punchDate.getUTCHours() + 5) * 60 + punchDate.getUTCMinutes() + 30) % (24 * 60);
      if (punchMin > graceMin) lateDays++;
    }

    const presentDays = punchDates.size;

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

    const effectiveWorkDays = workingDays - uhDays - leaveDays;
    const absentDays = Math.max(0, effectiveWorkDays - presentDays);
    const perDayRate = workingDays > 0 ? emp.monthlySalary / workingDays : 0;
    const deduction = Math.round(perDayRate * absentDays);
    const netPay = emp.monthlySalary - deduction;

    return {
      id: emp.id,
      name: emp.name,
      monthlySalary: emp.monthlySalary,
      workingDays,
      presentDays,
      absentDays,
      lateDays,
      leaveDays,
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
