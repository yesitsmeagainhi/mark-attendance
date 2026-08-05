import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { leaveRequests } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";

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
    .from(leaveRequests)
    .where(eq(leaveRequests.id, requestId))
    .get();

  if (!existing) {
    return Response.json({ error: "Request not found." }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return Response.json({ error: "Request has already been reviewed." }, { status: 409 });
  }

  const now = new Date().toISOString();

  db.update(leaveRequests)
    .set({ status: action, adminNote, reviewedAt: now })
    .where(eq(leaveRequests.id, requestId))
    .run();

  return Response.json({ ok: true, status: action });
}
