import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
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
  const monthParam = url.searchParams.get("month"); // e.g. "2026-07"

  // Determine date range
  let firstDay: string;
  let lastDay: string;
  let iterDates: string[];

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [yearStr, monStr] = monthParam.split("-");
    const yr = parseInt(yearStr, 10);
    const mn = parseInt(monStr, 10);
    firstDay = `${monthParam}-01`;
    const lastDate = new Date(yr, mn, 0).getDate();
    lastDay = `${monthParam}-${String(lastDate).padStart(2, "0")}`;

    // Build list of dates in this month (newest first), include Sundays
    const today = new Date().toISOString().slice(0, 10);
    iterDates = [];
    for (let d = lastDate; d >= 1; d--) {
      const dateStr = `${monthParam}-${String(d).padStart(2, "0")}`;
      if (dateStr > today) continue;
      iterDates.push(dateStr);
    }
  } else {
    // Fallback: last N days
    const days = Math.min(90, Math.max(7, parseInt(url.searchParams.get("days") || "30", 10) || 30));
    const today = new Date().toISOString().slice(0, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    firstDay = cutoffDate.toISOString().slice(0, 10);
    lastDay = today;

    iterDates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (dateStr > today) continue;
      iterDates.push(dateStr);
    }
  }

  const db = getDb();

  // Get employee's work start time for grace calculation
  const emp = db
    .select({ workStartTime: employees.workStartTime, flexibleHours: employees.flexibleHours })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  const workStartTime = emp?.workStartTime || "09:00";
  const [startH, startM] = workStartTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const empRules = getEffectiveRules(identity.employeeId);
  const graceDeadline = startMinutes + empRules.grace_period;
  const isFlexible = emp?.flexibleHours ?? false;

  // Get attendance records for the date range
  const records = db
    .select({
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      office: attendance.office,
      photoKey: attendance.photoKey,
      source: attendance.source,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, identity.employeeId),
        sql`date(${attendance.serverTimestamp}) >= ${firstDay}`,
        sql`date(${attendance.serverTimestamp}) <= ${lastDay}`,
      ),
    )
    .orderBy(desc(attendance.serverTimestamp))
    .all();

  // Get approved leaves in the same period
  const leaves = db
    .select({
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      leaveType: leaveRequests.leaveType,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, identity.employeeId),
        eq(leaveRequests.status, "approved"),
        sql`${leaveRequests.toDate} >= ${firstDay}`,
        sql`${leaveRequests.fromDate} <= ${lastDay}`,
      ),
    )
    .all();

  // Get holidays in the same period
  const holidayRecords = db
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(gte(holidays.date, firstDay), lte(holidays.date, lastDay)))
    .all();
  const holidayDates = new Set(holidayRecords.map((h) => h.date));

  // Group records by date (store all punches for multi-session support)
  type DayPunches = { punchIn?: string; punchOut?: string; office?: string; photoKeyIn?: string; photoKeyOut?: string; isAdminUH?: boolean; allPunches: { punchType: string; serverTimestamp: string }[] };
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
      if (!byDate[date].punchIn) {
        byDate[date].punchIn = r.serverTimestamp;
        byDate[date].office = r.office;
        byDate[date].photoKeyIn = r.photoKey;
        byDate[date].isAdminUH = false;
      } else if (r.serverTimestamp < byDate[date].punchIn!) {
        // Keep earliest IN
        byDate[date].punchIn = r.serverTimestamp;
        byDate[date].office = r.office;
        byDate[date].photoKeyIn = r.photoKey;
      }
    }
    if (r.punchType === "OUT") {
      // Keep latest OUT
      if (!byDate[date].punchOut || r.serverTimestamp > byDate[date].punchOut!) {
        byDate[date].punchOut = r.serverTimestamp;
        byDate[date].photoKeyOut = r.photoKey;
      }
    }
  }

  // Build leave date set
  const leaveDates = new Set<string>();
  for (const l of leaves) {
    const from = new Date(l.fromDate);
    const to = new Date(l.toDate);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      leaveDates.add(d.toISOString().slice(0, 10));
    }
  }

  // Build daily records
  const today = new Date().toISOString().slice(0, 10);
  const halfDayMinutes = empRules.minimum_hours_for_half_day * 60;
  const fullDayMinutes = empRules.minimum_hours_for_full_day * 60;
  const result: Array<{
    date: string;
    punchInTime: string | null;
    punchOutTime: string | null;
    duration: number | null;
    status: string;
    lateByMinutes: number | null;
    office: string | null;
    photoKeyIn: string | null;
    photoKeyOut: string | null;
  }> = [];

  let presentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let uhDays = 0;
  let sundayWorkedDays = 0;

  for (const dateStr of iterDates) {
    const dayData = byDate[dateStr];
    const isLeave = leaveDates.has(dateStr);

    // Sunday handling — check if employee worked
    const [yr2, mn2, dy2] = dateStr.split("-").map(Number);
    const isSunday = new Date(yr2, mn2 - 1, dy2).getDay() === 0;
    if (isSunday) {
      if (dayData?.punchIn && dayData?.punchOut) {
        // Worked on Sunday — Extra Pay (counts as present)
        const sorted = [...dayData.allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
        const totalDur = calculateTotalDuration(sorted);
        const duration: number | null = totalDur > 0 ? totalDur : null;
        sundayWorkedDays++;
        presentDays++;
        result.push({ date: dateStr, punchInTime: dayData.punchIn, punchOutTime: dayData.punchOut, duration, status: "Extra Pay", lateByMinutes: null, office: dayData.office || null, photoKeyIn: dayData.photoKeyIn || null, photoKeyOut: dayData.photoKeyOut || null });
      } else {
        // Regular Sunday off
        result.push({ date: dateStr, punchInTime: null, punchOutTime: null, duration: null, status: "Sunday", lateByMinutes: null, office: null, photoKeyIn: null, photoKeyOut: null });
      }
      continue;
    }

    if (isLeave) {
      result.push({ date: dateStr, punchInTime: null, punchOutTime: null, duration: null, status: "Leave", lateByMinutes: null, office: null, photoKeyIn: null, photoKeyOut: null });
      continue;
    }

    // No punch — check for UH/holiday or mark absent
    if (!dayData?.punchIn) {
      if (holidayDates.has(dateStr) || dayData?.isAdminUH) {
        uhDays++;
        result.push({ date: dateStr, punchInTime: null, punchOutTime: null, duration: null, status: "UH", lateByMinutes: null, office: null, photoKeyIn: null, photoKeyOut: null });
        continue;
      }
      // Only mark absent for past days, not today
      if (dateStr < today) {
        result.push({ date: dateStr, punchInTime: null, punchOutTime: null, duration: null, status: "Absent", lateByMinutes: null, office: null, photoKeyIn: null, photoKeyOut: null });
      }
      continue;
    }

    // If punch-out is missing, treat as absent (incomplete record)
    if (!dayData.punchOut) {
      result.push({ date: dateStr, punchInTime: dayData.punchIn, punchOutTime: null, duration: null, status: "Absent", lateByMinutes: null, office: dayData.office || null, photoKeyIn: dayData.photoKeyIn || null, photoKeyOut: null });
      continue;
    }

    // Calculate total duration across all IN/OUT pairs
    const sorted = [...dayData.allPunches].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
    const totalDur = calculateTotalDuration(sorted);
    const duration: number | null = totalDur > 0 ? totalDur : null;

    // Three-tier check: short-day / half-day / present (for past completed days)
    // Skip for flexible-hours employees
    if (!isFlexible && dateStr < today) {
      if (totalDur < halfDayMinutes) {
        result.push({ date: dateStr, punchInTime: dayData.punchIn, punchOutTime: dayData.punchOut, duration, status: "Short Day", lateByMinutes: null, office: dayData.office || null, photoKeyIn: dayData.photoKeyIn || null, photoKeyOut: dayData.photoKeyOut || null });
        continue;
      }
      if (totalDur < fullDayMinutes) {
        halfDays++;
        result.push({ date: dateStr, punchInTime: dayData.punchIn, punchOutTime: dayData.punchOut, duration, status: "Half Day", lateByMinutes: null, office: dayData.office || null, photoKeyIn: dayData.photoKeyIn || null, photoKeyOut: dayData.photoKeyOut || null });
        continue;
      }
    }

    const inDate = new Date(dayData.punchIn.replace(" ", "T") + (dayData.punchIn.includes("Z") ? "" : "Z"));
    const inIST = new Date(inDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const punchMinutes = inIST.getHours() * 60 + inIST.getMinutes();

    let status = "On time";
    let lateByMinutes: number | null = null;
    if (!isFlexible && punchMinutes > graceDeadline) {
      status = "Late";
      lateByMinutes = punchMinutes - startMinutes;
      lateDays++;
    }
    presentDays++;

    result.push({
      date: dateStr,
      punchInTime: dayData.punchIn,
      punchOutTime: dayData.punchOut || null,
      duration,
      status,
      lateByMinutes,
      office: dayData.office || null,
      photoKeyIn: dayData.photoKeyIn || null,
      photoKeyOut: dayData.photoKeyOut || null,
    });
  }

  return Response.json({
    records: result,
    totalDays: result.length,
    presentDays,
    lateDays,
    halfDays,
    uhDays,
    sundayWorkedDays,
    absentDays: result.filter((r) => r.status === "Absent" || r.status === "Short Day").length,
    leaveDays: result.filter((r) => r.status === "Leave").length,
  });
}
