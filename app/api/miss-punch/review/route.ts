import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { missPunchRequests, attendance, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { istToUTC } from "../../../../lib/time-utils";
import { logActivity } from "../../../../lib/activity-logger";

export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { requestId?: string; action?: string; adminNote?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const requestId = body.requestId?.trim();
  const action = body.action;
  const adminNote = body.adminNote?.trim() || null;

  if (!requestId) {
    return Response.json({ error: "Request ID is required." }, { status: 400 });
  }
  if (action !== "approved" && action !== "rejected") {
    return Response.json({ error: "Action must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const db = getDb();

  const existing = db
    .select()
    .from(missPunchRequests)
    .where(eq(missPunchRequests.id, requestId))
    .get();

  if (!existing) {
    return Response.json({ error: "Request not found." }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return Response.json({ error: "Request has already been reviewed." }, { status: 409 });
  }

  const now = new Date().toISOString();

  db.update(missPunchRequests)
    .set({ status: action, adminNote, reviewedAt: now })
    .where(eq(missPunchRequests.id, requestId))
    .run();

  // If approved, insert an attendance record to backfill the missed punch
  if (action === "approved") {
    const emp = db
      .select({ office: employees.office })
      .from(employees)
      .where(eq(employees.id, existing.employeeId))
      .get();

    // Check for duplicate before inserting
    const duplicate = db
      .select({ id: attendance.id })
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, existing.employeeId),
          eq(attendance.punchType, existing.punchType as "IN" | "OUT"),
          sql`date(${attendance.serverTimestamp}) = ${existing.date}`,
        ),
      )
      .limit(1)
      .get();

    if (!duplicate) {
      const attendanceId = crypto.randomUUID();
      // Convert IST time to UTC for consistent storage
      const timestamp = istToUTC(existing.date, existing.requestedTime);

      db.insert(attendance)
        .values({
          id: attendanceId,
          employeeId: existing.employeeId,
          punchType: existing.punchType as "IN" | "OUT",
          serverTimestamp: timestamp,
          photoKey: `miss-punch/approved/${requestId}`,
          contentType: "text/plain",
          office: emp?.office || "Bhayandar Office",
        })
        .run();
    }
  }

  const empName = db.select({ name: employees.name }).from(employees).where(eq(employees.id, existing.employeeId)).get();
  logActivity({
    actionType: action === "approved" ? "misspunch_approved" : "misspunch_rejected",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: existing.employeeId,
    targetName: empName?.name || existing.employeeId,
    description: `Admin ${action} miss punch request from ${empName?.name || existing.employeeId} for ${existing.date}`,
    metadata: { date: existing.date, punchType: existing.punchType, requestedTime: existing.requestedTime, action },
  });

  return Response.json({ ok: true, status: action });
}
