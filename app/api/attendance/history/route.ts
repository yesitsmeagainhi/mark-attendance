import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, leaveRequests } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";

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
  const graceDeadline = startMinutes + 15;

  // Get attendance records for the last N days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString().slice(0, 10);

  const records = db
    .select({
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      office: attendance.office,
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

  // Group records by date
  const byDate: Record<string, { punchIn?: string; punchOut?: string; office?: string }> = {};
  for (const r of records) {
    const date = r.serverTimestamp.slice(0, 10);
    if (!byDate[date]) byDate[date] = {};
    if (r.punchType === "IN") {
      byDate[date].punchIn = r.serverTimestamp;
      byDate[date].office = r.office;
    } else {
      byDate[date].punchOut = r.serverTimestamp;
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
  const result: Array<{
    date: string;
    punchInTime: string | null;
    punchOutTime: string | null;
    duration: number | null;
    status: string;
    office: string | null;
  }> = [];

  let presentDays = 0;
  let lateDays = 0;

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
      result.push({ date: dateStr, punchInTime: null, punchOutTime: null, duration: null, status: "Leave", office: null });
      continue;
    }

    if (!dayData?.punchIn) {
      // Only mark absent for past days, not today
      if (dateStr < today) {
        result.push({ date: dateStr, punchInTime: null, punchOutTime: null, duration: null, status: "Absent", office: null });
      }
      continue;
    }

    const inDate = new Date(dayData.punchIn.replace(" ", "T") + (dayData.punchIn.includes("Z") ? "" : "Z"));
    const inIST = new Date(inDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const punchMinutes = inIST.getHours() * 60 + inIST.getMinutes();

    let status = "On time";
    if (punchMinutes > graceDeadline) {
      status = "Late";
      lateDays++;
    }
    presentDays++;

    let duration: number | null = null;
    if (dayData.punchOut) {
      const outDate = new Date(dayData.punchOut.replace(" ", "T") + (dayData.punchOut.includes("Z") ? "" : "Z"));
      duration = Math.floor((outDate.getTime() - inDate.getTime()) / 60000);
    }

    result.push({
      date: dateStr,
      punchInTime: dayData.punchIn,
      punchOutTime: dayData.punchOut || null,
      duration,
      status,
      office: dayData.office || null,
    });
  }

  return Response.json({
    records: result,
    totalDays: result.length,
    presentDays,
    lateDays,
    absentDays: result.filter((r) => r.status === "Absent").length,
    leaveDays: result.filter((r) => r.status === "Leave").length,
  });
}
