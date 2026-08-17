import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const now = new Date();
  const from = url.searchParams.get("from") || new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || now.toISOString().slice(0, 10);
  const employeeFilter = url.searchParams.get("employee") || "";

  const db = getDb();

  const conditions = [
    sql`date(${attendance.serverTimestamp}) >= ${from}`,
    sql`date(${attendance.serverTimestamp}) <= ${to}`,
  ];

  if (employeeFilter) {
    conditions.push(eq(attendance.employeeId, employeeFilter));
  }

  const records = db
    .select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      employeeName: employees.name,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      office: attendance.office,
      source: attendance.source,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .innerJoin(employees, eq(attendance.employeeId, employees.id))
    .where(and(...conditions))
    .orderBy(desc(attendance.serverTimestamp))
    .limit(500)
    .all();

  // Group by employee+date for duration calculation
  type GroupedRecord = {
    employeeId: string;
    employeeName: string;
    date: string;
    punchIn: string | null;
    punchOut: string | null;
    durationMinutes: number | null;
    status: string;
    source: string;
    photoKeyIn: string | null;
    photoKeyOut: string | null;
  };

  const grouped = new Map<string, GroupedRecord>();

  for (const r of records) {
    const dateStr = r.serverTimestamp.slice(0, 10);
    const key = `${r.employeeId}-${dateStr}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        date: dateStr,
        punchIn: null,
        punchOut: null,
        durationMinutes: null,
        status: r.source === "admin" && r.photoKey === "admin/unpaid-holiday" ? "UH" : "present",
        source: r.source,
        photoKeyIn: null,
        photoKeyOut: null,
      });
    }

    const entry = grouped.get(key)!;
    if (r.punchType === "IN") {
      entry.punchIn = r.serverTimestamp;
      entry.photoKeyIn = r.photoKey;
      entry.source = r.source;
    } else if (r.punchType === "OUT") {
      entry.punchOut = r.serverTimestamp;
      entry.photoKeyOut = r.photoKey;
    }
  }

  // Calculate durations and check for missing punch-outs
  const todayStr = new Date().toISOString().slice(0, 10);
  const result: GroupedRecord[] = [];
  for (const entry of grouped.values()) {
    if (entry.punchIn && entry.punchOut) {
      const inDate = new Date(entry.punchIn.replace(" ", "T") + (entry.punchIn.includes("Z") ? "" : "Z"));
      const outDate = new Date(entry.punchOut.replace(" ", "T") + (entry.punchOut.includes("Z") ? "" : "Z"));
      entry.durationMinutes = Math.max(0, Math.floor((outDate.getTime() - inDate.getTime()) / 60000));
    } else if (entry.punchIn && !entry.punchOut && entry.date < todayStr && entry.status !== "UH") {
      entry.status = "absent";
    }
    result.push(entry);
  }

  // Sort by date desc, then employee name
  result.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName));

  return Response.json({ records: result });
}
