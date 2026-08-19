import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";
import { getEffectiveRules } from "../../../../lib/rules";
import { calculateTotalDuration } from "../../../../lib/time-utils";

export async function GET(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(7, parseInt(url.searchParams.get("days") || "30", 10) || 30));

  const db = getDb();

  // Get employee's work start time for grace calculation
  const emp = db
    .select({ workStartTime: employees.workStartTime })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  const workStartTime = emp?.workStartTime || "09:00";
  const [startH, startM] = workStartTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const empRules = getEffectiveRules(identity.employeeId);
  const graceDeadline = startMinutes + empRules.grace_period;

  // Get attendance records for the last N days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString().slice(0, 10);

  const records = db
    .select({
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      office: attendance.office,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, identity.employeeId),
        sql`date(${attendance.serverTimestamp}) >= ${cutoff}`,
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
        sql`${leaveRequests.toDate} >= ${cutoff}`,
      ),
    )
    .all();

  // Group records by date (store all punches for multi-session support)
  type DayPunches = { punchIn?: string; punchOut?: string; office?: string; photoKeyIn?: string; photoKeyOut?: string; allPunches: { punchType: string; serverTimestamp: string }[] };
  const byDate: Record<string, DayPunches> = {};
  for (const r of records) {
    const date = r.serverTimestamp.slice(0, 10);
    if (!byDate[date]) byDate[date] = { allPunches: [] };
    byDate[date].allPunches.push({ punchType: r.punchType, serverTimestamp: r.serverTimestamp });
    if (r.punchType === "IN" && !byDate[date].punchIn) {
      // First IN (since records are ordered DESC, this is actually the latest IN — we need earliest)
      byDate[date].punchIn = r.serverTimestamp;
      byDate[date].office = r.office;
      byDate[date].photoKeyIn = r.photoKey;
    } else if (r.punchType === "IN") {
      // Keep earliest IN
      if (r.serverTimestamp < byDate[date].punchIn!) {
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

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    if (dateStr > today) continue;

    // Skip Sundays
    if (d.getDay() === 0) continue;

    const dayData = byDate[dateStr];
    const isLeave = leaveDates.has(dateStr);

    if (isLeave) {
      result.push({ date: dateStr, punchInTime: null, punchOutTime: null, duration: null, status: "Leave",lateByMinutes:null, office: null, photoKeyIn: null, photoKeyOut: null });
      continue;
    }

    if (!dayData?.punchIn) {
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
    let duration: number | null = totalDur > 0 ? totalDur : null;

    // Three-tier check: short-day / half-day / present (for past completed days)
    if (dateStr < today) {
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
    if (punchMinutes > graceDeadline) {
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
    absentDays: result.filter((r) => r.status === "Absent" || r.status === "Short Day").length,
    leaveDays: result.filter((r) => r.status === "Leave").length,
  });
}
