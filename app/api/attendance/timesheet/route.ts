import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests, holidays } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";
import { getEffectiveRules } from "../../../../lib/rules";
import { calculateTotalDuration } from "../../../../lib/time-utils";

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

  // Get employee work schedule + flexibleHours
  const emp = db
    .select({ workStartTime: employees.workStartTime, workEndTime: employees.workEndTime, flexibleHours: employees.flexibleHours })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  const isFlexible = emp?.flexibleHours ?? false;
  const empRules = getEffectiveRules(identity.employeeId);
  const halfDayMinutes = empRules.minimum_hours_for_half_day * 60;
  const fullDayMinutes = empRules.minimum_hours_for_full_day * 60;

  // Get attendance records for this month
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

  // Group attendance by date, tracking all punches for multi-session duration
  type DayPunches = {
    punchIn?: string;
    punchOut?: string;
    isAdminUH?: boolean;
    allPunches: { punchType: string; serverTimestamp: string }[];
  };
  const byDate: Record<string, DayPunches> = {};
  for (const r of records) {
    const date = r.serverTimestamp.slice(0, 10);
    if (!byDate[date]) byDate[date] = { allPunches: [] };
    byDate[date].allPunches.push({ punchType: r.punchType, serverTimestamp: r.serverTimestamp });

    // Handle admin UH records
    if (r.photoKey === "admin/unpaid-holiday") {
      if (!byDate[date].punchIn) byDate[date].isAdminUH = true;
      continue;
    }

    if (r.punchType === "IN") {
      // Keep earliest IN, prefer non-admin (selfie) records
      if (!byDate[date].punchIn || r.source !== "admin") {
        if (!byDate[date].punchIn || r.serverTimestamp < byDate[date].punchIn!) {
          byDate[date].punchIn = r.serverTimestamp;
        }
        byDate[date].isAdminUH = false;
      }
    } else if (r.punchType === "OUT") {
      // Keep latest OUT
      if (!byDate[date].punchOut || r.serverTimestamp > byDate[date].punchOut!) {
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
  let halfDays = 0;
  let sundayWorkedDays = 0;

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
      // Check if employee worked on Sunday
      const sundayData = byDate[dateStr];
      if (sundayData?.punchIn && sundayData?.punchOut) {
        const sorted = [...sundayData.allPunches]
          .filter((p) => p.punchType === "IN" || p.punchType === "OUT")
          .sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
        const totalDur = calculateTotalDuration(sorted);
        const duration: number | null = totalDur > 0 ? totalDur : null;
        sundayWorkedDays++;
        presentDays++;
        if (duration) totalMinutesWorked += totalDur;
        days.push({ date: dateStr, dayOfWeek, status: "extra-pay", punchIn: sundayData.punchIn, punchOut: sundayData.punchOut, duration });
      } else {
        days.push({ date: dateStr, dayOfWeek, status: "sunday", punchIn: null, punchOut: null, duration: null });
      }
      continue;
    }

    if (leaveDates.has(dateStr)) {
      leaveDaysCount++;
      days.push({ date: dateStr, dayOfWeek, status: "leave", punchIn: null, punchOut: null, duration: null });
      continue;
    }

    const dayData = byDate[dateStr];

    // No punch at all — check for UH/holiday or mark absent
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

    // Calculate total duration across all IN/OUT pairs (multi-session)
    const sorted = [...dayData.allPunches]
      .filter((p) => p.punchType === "IN" || p.punchType === "OUT")
      .sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
    const totalDur = calculateTotalDuration(sorted);
    const duration: number | null = totalDur > 0 ? totalDur : null;

    // Three-tier check for past completed days (skip for flexible-hours employees)
    if (!isFlexible && dateStr < today && dayData.punchOut) {
      if (totalDur < halfDayMinutes) {
        // Short day — counts as absent
        absentDays++;
        days.push({ date: dateStr, dayOfWeek, status: "short", punchIn: dayData.punchIn, punchOut: dayData.punchOut, duration });
        continue;
      }
      if (totalDur < fullDayMinutes) {
        halfDays++;
        days.push({ date: dateStr, dayOfWeek, status: "half", punchIn: dayData.punchIn, punchOut: dayData.punchOut, duration });
        continue;
      }
    }

    presentDays++;
    if (duration) totalMinutesWorked += totalDur;

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
    halfDays,
    leaveDays: leaveDaysCount,
    uhDays,
    sundayWorkedDays,
  });
}
