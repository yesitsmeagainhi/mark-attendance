import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { leaveRequests, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
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
  if (action !== "approved" && action !== "rejected" && action !== "cancelled") {
    return Response.json({ error: "Action must be 'approved', 'rejected' or 'cancelled'." }, { status: 400 });
  }

  const db = getDb();

  const existing = db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.id, requestId))
    .get();

  if (!existing) {
    return Response.json({ error: "Request not found." }, { status: 404 });
  }
  const now = new Date().toISOString();
  const emp = db.select({ name: employees.name }).from(employees).where(eq(employees.id, existing.employeeId)).get();

  // Cancel an approved leave: the days count as normal working days again.
  // Stored as rejected (with a note), so every report treats it like any refused request.
  if (action === "cancelled") {
    if (existing.status !== "approved") {
      return Response.json({ error: "Only approved leave can be cancelled." }, { status: 409 });
    }
    const note = adminNote ? `Approval cancelled: ${adminNote}` : "Approval cancelled by admin";
    db.update(leaveRequests)
      .set({ status: "rejected", adminNote: note, reviewedAt: now })
      .where(eq(leaveRequests.id, requestId))
      .run();
    logActivity({
      actionType: "leave_rejected",
      performedBy: auth.identity.employeeId,
      performedByName: auth.identity.displayName,
      targetId: existing.employeeId,
      targetName: emp?.name || existing.employeeId,
      description: `${auth.identity.displayName} cancelled the approved ${existing.leaveType} leave of ${emp?.name || existing.employeeId} (${existing.fromDate} to ${existing.toDate})`,
      metadata: { leaveType: existing.leaveType, fromDate: existing.fromDate, toDate: existing.toDate, action: "cancelled" },
    });
    return Response.json({ ok: true, status: "rejected" });
  }

  if (existing.status !== "pending") {
    return Response.json({ error: "Request has already been reviewed." }, { status: 409 });
  }

  db.update(leaveRequests)
    .set({ status: action, adminNote, reviewedAt: now })
    .where(eq(leaveRequests.id, requestId))
    .run();

  logActivity({
    actionType: action === "approved" ? "leave_approved" : "leave_rejected",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: existing.employeeId,
    targetName: emp?.name || existing.employeeId,
    description: `Admin ${action} ${existing.leaveType} leave request from ${emp?.name || existing.employeeId} (${existing.fromDate} to ${existing.toDate})`,
    metadata: { leaveType: existing.leaveType, fromDate: existing.fromDate, toDate: existing.toDate, action },
  });

  return Response.json({ ok: true, status: action });
}
