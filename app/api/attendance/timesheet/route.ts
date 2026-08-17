import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests, holidays } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";

export async function GET(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = url.searchParams.get("month") || defaultMonth;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "Invalid month format. Use YYYY-MM." }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  const db = getDb();

  // Get employee work schedule
  const emp = db
    .select({ workStartTime: employees.workStartTime, workEndTime: employees.workEndTime })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  // Get attendance records for this month (include source + photoKey for priority logic)
  const records = db
    .select({
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      source: attendance.source,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, identity.employeeId),
        sql`date(${attendance.serverTimestamp}) >= ${monthStart}`,
        sql`date(${attendance.serverTimestamp}) <= ${monthEnd}`,
      ),
    )
    .all();

  // Get approved leaves that overlap this month
  const leaves = db
    .select({
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, identity.employeeId),
        eq(leaveRequests.status, "approved"),
        sql`${leaveRequests.fromDate} <= ${monthEnd}`,
        sql`${leaveRequests.toDate} >= ${monthStart}`,
      ),
    )
    .all();

  // Get holidays for this month
  const holidayRecords = db
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(gte(holidays.date, monthStart), lte(holidays.date, monthEnd)))
    .all();
  const holidayDates = new Set(holidayRecords.map((h) => h.date));

  // Group attendance by date, preferring selfie records over admin records
  const byDate: Record<string, { punchIn?: string; punchOut?: string; isAdminUH?: boolean }> = {};
  for (const r of records) {
    const date = r.serverTimestamp.slice(0, 10);
    if (!byDate[date]) byDate[date] = {};

    // Skip admin UH records if a selfie record already exists for this date+type
    if (r.photoKey === "admin/unpaid-holiday") {
      // Only mark as UH if no real punch exists yet
      if (!byDate[date].punchIn) byDate[date].isAdminUH = true;
      continue;
    }

    if (r.punchType === "IN") {
      // Prefer non-admin (selfie) records — overwrite admin records
      if (!byDate[date].punchIn || r.source !== "admin") {
        byDate[date].punchIn = r.serverTimestamp;
        byDate[date].isAdminUH = false; // real punch overrides UH
      }
    } else {
      if (!byDate[date].punchOut || r.source !== "admin") {
        byDate[date].punchOut = r.serverTimestamp;
      }
    }
  }

  // Build leave date set
  const leaveDates = new Set<string>();
  for (const l of leaves) {
    const from = new Date(l.fromDate);
    const to = new Date(l.toDate);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      if (ds >= monthStart && ds <= monthEnd) leaveDates.add(ds);
    }
  }

  // Build day-by-day data
  const days: Array<{
    date: string;
    dayOfWeek: number;
    status: string;
    punchIn: string | null;
    punchOut: string | null;
    duration: number | null;
  }> = [];

  let totalMinutesWorked = 0;
  let presentDays = 0;
  let absentDays = 0;
  let leaveDaysCount = 0;
  let uhDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${month}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(year, mon - 1, d);
    const dayOfWeek = dateObj.getDay();
    const isSunday = dayOfWeek === 0;
    const isFuture = dateStr > today;

    if (isFuture) {
      days.push({ date: dateStr, dayOfWeek, status: "future", punchIn: null, punchOut: null, duration: null });
      continue;
    }

    if (isSunday) {
      days.push({ date: dateStr, dayOfWeek, status: "holiday", punchIn: null, punchOut: null, duration: null });
      continue;
    }

    if (leaveDates.has(dateStr)) {
      leaveDaysCount++;
      days.push({ date: dateStr, dayOfWeek, status: "leave", punchIn: null, punchOut: null, duration: null });
      continue;
    }

    const dayData = byDate[dateStr];

    // Check for unpaid holiday — either from holidays table or admin UH record
    // Only apply if the employee has no real punch for this day
    if (!dayData?.punchIn) {
      if (holidayDates.has(dateStr) || dayData?.isAdminUH) {
        uhDays++;
        days.push({ date: dateStr, dayOfWeek, status: "uh", punchIn: null, punchOut: null, duration: null });
        continue;
      }
      absentDays++;
      days.push({ date: dateStr, dayOfWeek, status: "absent", punchIn: null, punchOut: null, duration: null });
      continue;
    }

    // If punch-out is missing on a past day, treat as absent
    if (!dayData.punchOut && dateStr < today) {
      absentDays++;
      days.push({ date: dateStr, dayOfWeek, status: "absent", punchIn: dayData.punchIn, punchOut: null, duration: null });
      continue;
    }

    presentDays++;
    let duration: number | null = null;
    if (dayData.punchOut) {
      const inDate = new Date(dayData.punchIn.replace(" ", "T") + (dayData.punchIn.includes("Z") ? "" : "Z"));
      const outDate = new Date(dayData.punchOut.replace(" ", "T") + (dayData.punchOut.includes("Z") ? "" : "Z"));
      duration = Math.floor((outDate.getTime() - inDate.getTime()) / 60000);
      totalMinutesWorked += duration;
    }

    days.push({
      date: dateStr,
      dayOfWeek,
      status: "present",
      punchIn: dayData.punchIn,
      punchOut: dayData.punchOut || null,
      duration,
    });
  }

  return Response.json({
    month,
    days,
    totalHoursWorked: Math.round((totalMinutesWorked / 60) * 10) / 10,
    presentDays,
    absentDays,
    leaveDays: leaveDaysCount,
    uhDays,
  });
}
