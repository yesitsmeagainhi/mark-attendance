import { eq, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { missPunchRequests, employees } from "../../../db/schema";
import { getAppIdentity } from "../../authz";
import { logActivity } from "../../../lib/activity-logger";

export async function GET() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const db = getDb();

  if (identity.role === "admin") {
    const requests = db
      .select({
        id: missPunchRequests.id,
        employeeId: missPunchRequests.employeeId,
        employeeName: employees.name,
        date: missPunchRequests.date,
        punchType: missPunchRequests.punchType,
        requestedTime: missPunchRequests.requestedTime,
        reason: missPunchRequests.reason,
        status: missPunchRequests.status,
        adminNote: missPunchRequests.adminNote,
        createdAt: missPunchRequests.createdAt,
        reviewedAt: missPunchRequests.reviewedAt,
      })
      .from(missPunchRequests)
      .innerJoin(employees, eq(missPunchRequests.employeeId, employees.id))
      .orderBy(desc(missPunchRequests.createdAt))
      .all();
    return Response.json({ requests });
  }

  const requests = db
    .select({
      id: missPunchRequests.id,
      employeeId: missPunchRequests.employeeId,
      date: missPunchRequests.date,
      punchType: missPunchRequests.punchType,
      requestedTime: missPunchRequests.requestedTime,
      reason: missPunchRequests.reason,
      status: missPunchRequests.status,
      adminNote: missPunchRequests.adminNote,
      createdAt: missPunchRequests.createdAt,
      reviewedAt: missPunchRequests.reviewedAt,
    })
    .from(missPunchRequests)
    .where(eq(missPunchRequests.employeeId, identity.employeeId))
    .orderBy(desc(missPunchRequests.createdAt))
    .all();

  return Response.json({ requests });
}

export async function POST(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { date?: string; punchType?: string; requestedTime?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const date = body.date?.trim();
  const punchType = body.punchType === "OUT" ? "OUT" : "IN";
  const requestedTime = body.requestedTime?.trim();
  const reason = body.reason?.trim();

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Valid date is required (YYYY-MM-DD)." }, { status: 400 });
  }
  if (!requestedTime || !/^\d{2}:\d{2}$/.test(requestedTime)) {
    return Response.json({ error: "Valid time is required (HH:MM)." }, { status: 400 });
  }
  if (!reason || reason.length < 5) {
    return Response.json({ error: "Reason must be at least 5 characters." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (date > today) {
    return Response.json({ error: "Date cannot be in the future." }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();

  db.insert(missPunchRequests)
    .values({
      id,
      employeeId: identity.employeeId,
      date,
      punchType: punchType as "IN" | "OUT",
      requestedTime,
      reason,
    })
    .run();

  logActivity({
    actionType: "misspunch_request",
    performedBy: identity.employeeId,
    performedByName: identity.displayName,
    description: `${identity.displayName} submitted miss punch request for ${date} (${punchType} at ${requestedTime})`,
    metadata: { date, punchType, requestedTime, reason },
  });

  return Response.json({ id, status: "pending" }, { status: 201 });
}
