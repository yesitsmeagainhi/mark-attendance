import { createHash, randomUUID } from "node:crypto";
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { employees, employeeRuleOverrides, attendance, leaveRequests, missPunchRequests, sessions, dailyJournals, otpRequests } from "../../../db/schema";
import { requireApiRole, getAppIdentity } from "../../authz";

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const db = getDb();
  const records = db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: employees.role,
      jobRole: employees.jobRole,
      mobileNumber: employees.mobileNumber,
      workStartTime: employees.workStartTime,
      workEndTime: employees.workEndTime,
      office: employees.office,
      department: employees.department,
      active: employees.active,
      monthlySalary: employees.monthlySalary,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .orderBy(desc(employees.createdAt))
    .all();

  return Response.json({ employees: records });
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: {
    id?: string;
    name?: string;
    email?: string;
    password?: string;
    jobRole?: string;
    mobileNumber?: string;
    workStartTime?: string;
    workEndTime?: string;
    office?: string;
    department?: string;
    monthlySalary?: number;
    active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.id) {
    return Response.json({ error: "Employee ID is required." }, { status: 400 });
  }

  const db = getDb();
  const emp = db.select({ id: employees.id }).from(employees).where(eq(employees.id, body.id)).get();
  if (!emp) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return Response.json({ error: "Name cannot be empty." }, { status: 400 });
    updates.name = name;
  }

  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase();
    if (!email) return Response.json({ error: "Email cannot be empty." }, { status: 400 });
    // Check duplicate email (excluding current employee)
    const dup = db.select({ id: employees.id }).from(employees)
      .where(sql`lower(${employees.email}) = ${email} AND ${employees.id} != ${body.id}`)
      .limit(1).get();
    if (dup) return Response.json({ error: "Another employee already uses this email." }, { status: 409 });
    updates.email = email;
  }

  if (body.password !== undefined && body.password.length > 0) {
    if (body.password.length < 4) return Response.json({ error: "Password must be at least 4 characters." }, { status: 400 });
    updates.password = createHash("sha256").update(body.password).digest("hex");
  }

  if (body.jobRole !== undefined) updates.jobRole = body.jobRole.trim();
  if (body.mobileNumber !== undefined) updates.mobileNumber = body.mobileNumber.replace(/\D/g, "");
  if (body.workStartTime !== undefined) updates.workStartTime = body.workStartTime;
  if (body.workEndTime !== undefined) updates.workEndTime = body.workEndTime;
  if (body.office !== undefined) updates.office = body.office.trim();
  if (body.department !== undefined) updates.department = body.department.trim();
  if (body.monthlySalary !== undefined) updates.monthlySalary = Math.max(0, Math.round(Number(body.monthlySalary) || 0));
  if (body.active !== undefined) updates.active = body.active;

  if (Object.keys(updates).length > 0) {
    db.update(employees).set(updates).where(eq(employees.id, body.id)).run();
  }

  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    jobRole?: string;
    mobileNumber?: string;
    workStartTime?: string;
    workEndTime?: string;
    office?: string;
    department?: string;
    ruleOverrides?: { ruleId: string; value: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const role = body.role === "admin" ? "admin" : "employee";
  const jobRole = body.jobRole?.trim() || "";
  const mobileNumber = body.mobileNumber?.replace(/\D/g, "") || "";
  const workStartTime = body.workStartTime || "09:00";
  const workEndTime = body.workEndTime || "18:00";
  const office = body.office?.trim() || "Bhayandar Office";
  const department = body.department?.trim() || "";

  if (!name) {
    return Response.json({ error: "Name is required." }, { status: 400 });
  }
  if (!email) {
    return Response.json({ error: "Email is required." }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return Response.json(
      { error: "Password must be at least 4 characters." },
      { status: 400 },
    );
  }

  const db = getDb();

  // Check for duplicate email
  const existing = db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`lower(${employees.email}) = ${email}`)
    .limit(1)
    .get();
  if (existing) {
    return Response.json(
      { error: "An employee with this email already exists." },
      { status: 409 },
    );
  }

  // Auto-generate next EMP-XXXX ID
  const lastEmployee = db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`${employees.id} LIKE 'EMP-%'`)
    .orderBy(desc(employees.id))
    .limit(1)
    .get();

  let nextNum = 1001;
  if (lastEmployee) {
    const num = parseInt(lastEmployee.id.replace("EMP-", ""), 10);
    if (!isNaN(num)) nextNum = num + 1;
  }
  const id = `EMP-${nextNum}`;

  const hashedPassword = createHash("sha256").update(password).digest("hex");

  db.insert(employees)
    .values({
      id,
      name,
      email,
      password: hashedPassword,
      role,
      jobRole,
      mobileNumber,
      workStartTime,
      workEndTime,
      office,
      department,
    })
    .run();

  // Insert rule overrides if provided
  if (body.ruleOverrides && Array.isArray(body.ruleOverrides)) {
    for (const override of body.ruleOverrides) {
      if (override.ruleId && override.value !== undefined) {
        db.insert(employeeRuleOverrides)
          .values({
            id: randomUUID(),
            employeeId: id,
            ruleId: override.ruleId,
            value: override.value,
          })
          .run();
      }
    }
  }

  return Response.json(
    { id, name, email, role, jobRole, mobileNumber, workStartTime, workEndTime, office, department },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.id) {
    return Response.json({ error: "Employee ID is required." }, { status: 400 });
  }

  // Prevent admin from deleting themselves
  const identity = await getAppIdentity();
  if (identity && identity.employeeId === body.id) {
    return Response.json({ error: "You cannot delete your own account." }, { status: 403 });
  }

  const db = getDb();
  const emp = db.select({ id: employees.id }).from(employees).where(eq(employees.id, body.id)).get();
  if (!emp) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  // Delete related records first (foreign key constraints)
  db.delete(attendance).where(eq(attendance.employeeId, body.id)).run();
  db.delete(leaveRequests).where(eq(leaveRequests.employeeId, body.id)).run();
  db.delete(missPunchRequests).where(eq(missPunchRequests.employeeId, body.id)).run();
  db.delete(employeeRuleOverrides).where(eq(employeeRuleOverrides.employeeId, body.id)).run();
  db.delete(sessions).where(eq(sessions.employeeId, body.id)).run();
  db.delete(dailyJournals).where(eq(dailyJournals.employeeId, body.id)).run();
  db.delete(otpRequests).where(eq(otpRequests.employeeId, body.id)).run();

  // Delete the employee
  db.delete(employees).where(eq(employees.id, body.id)).run();

  return Response.json({ ok: true });
}
