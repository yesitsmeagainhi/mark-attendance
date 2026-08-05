import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { istToUTC } from "../../../../lib/time-utils";

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { employeeId?: string; date?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { employeeId, date, action } = body;
  if (!employeeId || !date || !action) {
    return Response.json({ error: "employeeId, date, and action are required." }, { status: 400 });
  }
  if (!["present", "absent", "unpaid_holiday"].includes(action)) {
    return Response.json({ error: "Invalid action." }, { status: 400 });
  }

  const db = getDb();

  const emp = db
    .select({ id: employees.id, workStartTime: employees.workStartTime, workEndTime: employees.workEndTime, office: employees.office })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .get();
  if (!emp) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  if (action === "present") {
    // Delete any existing admin-marked records for this employee+date first
    db.delete(attendance)
      .where(and(
        eq(attendance.employeeId, employeeId),
        eq(attendance.source, "admin"),
        sql`date(${attendance.serverTimestamp}) = ${date}`,
      ))
      .run();

    // Check if employee already has a selfie-based punch for this date
    const existingSelfie = db
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(
        eq(attendance.employeeId, employeeId),
        eq(attendance.punchType, "IN"),
        sql`date(${attendance.serverTimestamp}) = ${date}`,
      ))
      .get();

    if (!existingSelfie) {
      // Create admin-marked punch IN
      db.insert(attendance).values({
        id: crypto.randomUUID(),
        employeeId,
        punchType: "IN",
        serverTimestamp: istToUTC(date, emp.workStartTime),
        photoKey: "admin-marked",
        contentType: "text/plain",
        office: emp.office,
        source: "admin",
      }).run();
    }
  } else if (action === "absent") {
    // Delete only admin-marked records
    db.delete(attendance)
      .where(and(
        eq(attendance.employeeId, employeeId),
        eq(attendance.source, "admin"),
        sql`date(${attendance.serverTimestamp}) = ${date}`,
      ))
      .run();
  } else if (action === "unpaid_holiday") {
    // Delete existing admin records and mark as UH
    db.delete(attendance)
      .where(and(
        eq(attendance.employeeId, employeeId),
        eq(attendance.source, "admin"),
        sql`date(${attendance.serverTimestamp}) = ${date}`,
      ))
      .run();

    // Create UH-marked record
    db.insert(attendance).values({
      id: crypto.randomUUID(),
      employeeId,
      punchType: "IN",
      serverTimestamp: istToUTC(date, emp.workStartTime),
      photoKey: "admin/unpaid-holiday",
      contentType: "text/plain",
      office: emp.office,
      source: "admin",
    }).run();
  }

  return Response.json({ ok: true });
}
