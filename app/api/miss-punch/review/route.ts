import { eq, and, sql, asc } from "drizzle-orm";
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

  // If approved, insert or update an attendance record for the missed punch
  if (action === "approved") {
    const emp = db
      .select({ office: employees.office })
      .from(employees)
      .where(eq(employees.id, existing.employeeId))
      .get();

    const timestamp = istToUTC(existing.date, existing.requestedTime);
    const punchType = existing.punchType as "IN" | "OUT";

    const insertPunch = () => {
      db.insert(attendance)
        .values({
          id: crypto.randomUUID(),
          employeeId: existing.employeeId,
          punchType,
          serverTimestamp: timestamp,
          photoKey: `miss-punch/approved/${requestId}`,
          contentType: "text/plain",
          office: emp?.office || "Bhayandar Office",
          source: "miss-punch",
        })
        .run();
    };

    // The day's punches, keyed the same way as the punch screen (UTC date of the punch)
    const dayPunches = db
      .select({ id: attendance.id, punchType: attendance.punchType, serverTimestamp: attendance.serverTimestamp })
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, existing.employeeId),
          sql`date(${attendance.serverTimestamp}) = ${timestamp.slice(0, 10)}`,
        ),
      )
      .orderBy(asc(attendance.serverTimestamp))
      .all();
    const before = [...dayPunches].reverse().find((p) => p.serverTimestamp <= timestamp);
    const after = dayPunches.find((p) => p.serverTimestamp > timestamp);

    if ((!before || before.punchType !== punchType) && (!after || after.punchType !== punchType)) {
      // The missed punch fits the IN/OUT order (e.g. forgot to punch in and later
      // punched out, or a missing lecture punch for a flexible employee): just add it
      insertPunch();
    } else {
      // A neighbouring punch already has this type, so the request corrects that punch.
      // Pick the closer same-type neighbour.
      const sameBefore = before?.punchType === punchType ? before : undefined;
      const sameAfter = after?.punchType === punchType ? after : undefined;
      const toMs = (ts: string) => new Date(ts.replace(" ", "T") + "Z").getTime();
      const target = sameBefore && sameAfter
        ? (toMs(timestamp) - toMs(sameBefore.serverTimestamp) <= toMs(sameAfter.serverTimestamp) - toMs(timestamp) ? sameBefore : sameAfter)
        : (sameBefore ?? sameAfter)!;
      const otherType = punchType === "IN" ? "OUT" : "IN";

      if (dayPunches.some((p) => p.punchType === otherType)) {
        // Wrong time on an existing punch — move it to the requested time
        db.update(attendance)
          .set({ serverTimestamp: timestamp, photoKey: `miss-punch/approved/${requestId}`, source: "miss-punch" })
          .where(eq(attendance.id, target.id))
          .run();
      } else {
        // Only punches of this type exist: e.g. forgot to punch in, so the later
        // punch was saved as a punch-in — make it the punch-out and add the punch-in
        db.update(attendance)
          .set({ punchType: otherType })
          .where(eq(attendance.id, target.id))
          .run();
        insertPunch();
      }
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
