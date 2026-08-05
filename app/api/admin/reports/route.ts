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

  // Get all active employees
  const allEmployees = db
    .select({
      id: employees.id,
      name: employees.name,
      workStartTime: employees.workStartTime,
    })
    .from(employees)
    .where(eq(employees.active, true))
    .orderBy(employees.name)
    .all();

  // Get attendance records for the month
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

  // Get approved leaves for the month
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

  // Get holidays
  const holidayRecords = db
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(
      gte(holidays.date, firstDay),
      lte(holidays.date, lastDayStr),
    ))
    .all();
  const holidayDates = new Set(holidayRecords.map((h) => h.date));

  // Calculate working days (exclude Sundays and holidays)
  let workingDays = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${month}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(year, mon - 1, d).getDay();
    if (dayOfWeek !== 0 && !holidayDates.has(dateStr) && dateStr <= today) {
      workingDays++;
    }
  }

  // Build per-employee report
  const report = allEmployees.map((emp) => {
    const empRecords = records.filter((r) => r.employeeId === emp.id && r.punchType === "IN");
    const [startH, startM] = emp.workStartTime.split(":").map(Number);
    const graceMin = startH * 60 + startM + 15;

    let presentDays = 0;
    let lateDays = 0;
    let uhDays = 0;

    // Group by date
    const byDate = new Map<string, typeof empRecords>();
    for (const r of empRecords) {
      const d = r.serverTimestamp.slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(r);
    }

    for (const [dateStr, dayRecords] of byDate) {
      // If a selfie-based punch exists, the employee actually came to work —
      // ignore any admin UH record for that date
      const hasSelfie = dayRecords.some((r) => r.source !== "admin");
      const isUH = !hasSelfie && dayRecords.some((r) => r.photoKey === "admin/unpaid-holiday");
      if (isUH) { uhDays++; continue; }

      presentDays++;
      // Check if late — prefer selfie record for timing
      const firstPunch = dayRecords.find((r) => r.source !== "admin") || dayRecords[0];
      const ts = firstPunch.serverTimestamp;
      const punchDate = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
      const punchMin = ((punchDate.getUTCHours() + 5) * 60 + punchDate.getUTCMinutes() + 30) % (24 * 60);
      if (punchMin > graceMin) lateDays++;
    }

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

    const countableDays = workingDays - uhDays - leaveDays;
    const absentDays = Math.max(0, countableDays - presentDays);
    const attendancePct = countableDays > 0 ? Math.round((presentDays / countableDays) * 100) : 100;

    return {
      id: emp.id,
      name: emp.name,
      presentDays,
      absentDays,
      lateDays,
      leaveDays,
      uhDays,
      attendancePct,
    };
  });

  return Response.json({ month, workingDays, employees: report });
}
