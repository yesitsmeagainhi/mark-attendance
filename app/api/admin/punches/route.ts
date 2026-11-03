import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { logActivity } from "../../../../lib/activity-logger";
import { formatTimeIST } from "../../../../lib/time-utils";
import { isPunchRemovalEnabled } from "../../../../lib/features";

/**
 * Remove a single punch (selfie, miss-punch or admin-made), e.g. a punch-out that
 * was recorded by mistake. The selfie photo file is kept on disk, and the removal
 * is written to the activity log with the punch's details.
 */
export async function DELETE(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;
  if (!isPunchRemovalEnabled()) {
    return Response.json({ error: "Removing punches is turned off on the server." }, { status: 403 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.id) {
    return Response.json({ error: "Punch id is required." }, { status: 400 });
  }

  const db = getDb();
  const punch = db
    .select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      source: attendance.source,
      office: attendance.office,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .where(eq(attendance.id, body.id))
    .get();
  if (!punch) {
    return Response.json({ error: "Punch not found. It may already have been removed." }, { status: 404 });
  }

  db.delete(attendance).where(eq(attendance.id, punch.id)).run();

  const emp = db.select({ name: employees.name }).from(employees).where(eq(employees.id, punch.employeeId)).get();
  const date = punch.serverTimestamp.slice(0, 10);
  const label = punch.punchType === "IN" ? "punch in" : "punch out";
  logActivity({
    actionType: "punch_removed",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: punch.employeeId,
    targetName: emp?.name || punch.employeeId,
    description: `Admin removed ${emp?.name || punch.employeeId}'s ${label} at ${formatTimeIST(punch.serverTimestamp)} on ${date}`,
    metadata: { ...punch, date },
  });

  return Response.json({ ok: true });
}
