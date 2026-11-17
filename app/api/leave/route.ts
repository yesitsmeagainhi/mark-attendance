import { and, eq, desc, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { leaveRequests, employees } from "../../../db/schema";
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
        id: leaveRequests.id,
        employeeId: leaveRequests.employeeId,
        employeeName: employees.name,
        leaveType: leaveRequests.leaveType,
        fromDate: leaveRequests.fromDate,
        toDate: leaveRequests.toDate,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        adminNote: leaveRequests.adminNote,
        createdAt: leaveRequests.createdAt,
        reviewedAt: leaveRequests.reviewedAt,
      })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .orderBy(desc(leaveRequests.createdAt))
      .all();
    return Response.json({ requests });
  }

  const requests = db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      leaveType: leaveRequests.leaveType,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      adminNote: leaveRequests.adminNote,
      createdAt: leaveRequests.createdAt,
      reviewedAt: leaveRequests.reviewedAt,
    })
    .from(leaveRequests)
    .where(eq(leaveRequests.employeeId, identity.employeeId))
    .orderBy(desc(leaveRequests.createdAt))
    .all();

  return Response.json({ requests });
}

export async function POST(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { leaveType?: string; fromDate?: string; toDate?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const leaveType = body.leaveType;
  const fromDate = body.fromDate?.trim();
  const toDate = body.toDate?.trim();
  const reason = body.reason?.trim();

  if (!leaveType || !["sick", "casual", "earned"].includes(leaveType)) {
    return Response.json({ error: "Leave type must be sick, casual, or earned." }, { status: 400 });
  }
  if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return Response.json({ error: "Valid from-date is required." }, { status: 400 });
  }
  if (!toDate || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return Response.json({ error: "Valid to-date is required." }, { status: 400 });
  }
  if (toDate < fromDate) {
    return Response.json({ error: "To-date must be on or after from-date." }, { status: 400 });
  }
  if (!reason || reason.length < 5) {
    return Response.json({ error: "Reason must be at least 5 characters." }, { status: 400 });
  }

  const db = getDb();

  // One request per day: refuse dates already covered by a pending or approved request
  const clash = db
    .select({ fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.employeeId, identity.employeeId),
      inArray(leaveRequests.status, ["pending", "approved"]),
      lte(leaveRequests.fromDate, toDate),
      gte(leaveRequests.toDate, fromDate),
    ))
    .get();
  if (clash) {
    const span = clash.fromDate === clash.toDate ? fmtDay(clash.fromDate) : `${fmtDay(clash.fromDate)} – ${fmtDay(clash.toDate)}`;
    return Response.json(
      { error: `You already have ${clash.status === "approved" ? "approved leave" : "a pending leave request"} for ${span}. Pick other dates${clash.status === "pending" ? ", or withdraw that request first" : ""}.` },
      { status: 409 },
    );
  }

  const id = crypto.randomUUID();

  db.insert(leaveRequests)
    .values({
      id,
      employeeId: identity.employeeId,
      leaveType: leaveType as "sick" | "casual" | "earned",
      fromDate,
      toDate,
      reason,
    })
    .run();

  logActivity({
    actionType: "leave_request",
    performedBy: identity.employeeId,
    performedByName: identity.displayName,
    description: `${identity.displayName} submitted ${leaveType} leave request (${fromDate} to ${toDate})`,
    metadata: { leaveType, fromDate, toDate, reason },
  });

  return Response.json({ id, status: "pending" }, { status: 201 });
}

/** "2026-10-06" → "06 Oct" */
function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/** Employee withdraws their own request while it is still pending: { id } */
export async function DELETE(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const db = getDb();
  const existing = body.id
    ? db.select().from(leaveRequests).where(and(eq(leaveRequests.id, body.id), eq(leaveRequests.employeeId, identity.employeeId))).get()
    : undefined;
  if (!existing) return Response.json({ error: "Request not found." }, { status: 404 });
  if (existing.status !== "pending") {
    return Response.json({ error: "Only a pending request can be withdrawn. Ask your admin to cancel approved leave." }, { status: 409 });
  }

  db.delete(leaveRequests).where(eq(leaveRequests.id, existing.id)).run();
  logActivity({
    actionType: "leave_request",
    performedBy: identity.employeeId,
    performedByName: identity.displayName,
    description: `${identity.displayName} withdrew their ${existing.leaveType} leave request (${existing.fromDate} to ${existing.toDate})`,
    metadata: { leaveType: existing.leaveType, fromDate: existing.fromDate, toDate: existing.toDate, withdrawn: true },
  });
  return Response.json({ ok: true });
}
