import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { logActivity } from "../../../../lib/activity-logger";

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { employeeId?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { employeeId, date } = body;
  if (!employeeId || !date) {
    return Response.json({ error: "employeeId and date are required." }, { status: 400 });
  }

  const db = getDb();

  const emp = db.select({ name: employees.name }).from(employees).where(eq(employees.id, employeeId)).get();

  // Delete only admin-created records for this employee on this date
  db.delete(attendance)
    .where(and(
      eq(attendance.employeeId, employeeId),
      eq(attendance.source, "admin"),
      sql`date(${attendance.serverTimestamp}) = ${date}`,
    ))
    .run();

  logActivity({
    actionType: "undo_mark",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: employeeId,
    targetName: emp?.name || employeeId,
    description: `Admin undid attendance mark for ${emp?.name || employeeId} on ${date}`,
    metadata: { date },
  });

  return Response.json({ ok: true });
}
