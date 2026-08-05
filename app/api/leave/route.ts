import { eq, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { leaveRequests, employees } from "../../../db/schema";
import { getAppIdentity } from "../../authz";

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

  return Response.json({ id, status: "pending" }, { status: 201 });
}
