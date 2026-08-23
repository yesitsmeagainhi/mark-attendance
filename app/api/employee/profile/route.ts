import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";
import { logActivity } from "../../../../lib/activity-logger";

/** How many times an employee may edit their own profile before Head Office has to step in. */
const MAX_PROFILE_EDITS = 2;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** True only for a real calendar date, so 2026-13-01 and 2026-02-31 are rejected. */
function isRealDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maxDay = month === 2 && isLeapYear ? 29 : DAYS_IN_MONTH[month - 1];
  return day >= 1 && day <= maxDay;
}

export async function GET() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const db = getDb();
  const emp = db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      jobRole: employees.jobRole,
      mobileNumber: employees.mobileNumber,
      workStartTime: employees.workStartTime,
      workEndTime: employees.workEndTime,
      office: employees.office,
      role: employees.role,
      dateOfBirth: employees.dateOfBirth,
      profileEditCount: employees.profileEditCount,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  if (!emp) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  return Response.json({
    profile: {
      ...emp,
      editsRemaining: Math.max(0, MAX_PROFILE_EDITS - emp.profileEditCount),
    },
  });
}

export async function PATCH(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { dateOfBirth?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !isRealDate(dateOfBirth)) {
    return Response.json({ error: "Date of birth must be YYYY-MM-DD." }, { status: 400 });
  }

  const db = getDb();
  // The employee only ever edits their own row; no id is accepted from the body.
  const emp = db
    .select({
      name: employees.name,
      dateOfBirth: employees.dateOfBirth,
      profileEditCount: employees.profileEditCount,
    })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  if (!emp) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  // Saving the same date again is a no-op and never costs an edit.
  if (emp.dateOfBirth === dateOfBirth) {
    return Response.json({
      ok: true,
      unchanged: true,
      editsRemaining: Math.max(0, MAX_PROFILE_EDITS - emp.profileEditCount),
    });
  }

  if (emp.profileEditCount >= MAX_PROFILE_EDITS) {
    return Response.json(
      { error: "You have used both of your profile edits. Please contact Head Office — Pooja Maam." },
      { status: 403 },
    );
  }

  const profileEditCount = emp.profileEditCount + 1;

  db.update(employees)
    .set({ dateOfBirth, profileEditCount })
    .where(eq(employees.id, identity.employeeId))
    .run();

  logActivity({
    actionType: "profile_updated",
    performedBy: identity.employeeId,
    performedByName: identity.displayName,
    targetId: identity.employeeId,
    targetName: emp.name,
    description: `${emp.name} changed their date of birth to ${dateOfBirth}`,
    metadata: { dateOfBirth, previousDateOfBirth: emp.dateOfBirth, profileEditCount },
  });

  return Response.json({
    ok: true,
    editsRemaining: Math.max(0, MAX_PROFILE_EDITS - profileEditCount),
  });
}
