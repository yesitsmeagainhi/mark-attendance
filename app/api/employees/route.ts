import { createHash, randomUUID } from "node:crypto";
import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { employees, employeeBranches, branches, employeeRuleOverrides, attendance, leaveRequests, missPunchRequests, sessions, dailyJournals, otpRequests, shifts } from "../../../db/schema";
import { requireApiRole, getAppIdentity } from "../../authz";

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role");

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
      companyName: employees.companyName,
      employeeAddress: employees.employeeAddress,
      active: employees.active,
      monthlySalary: employees.monthlySalary,
      hourlyRate: employees.hourlyRate,
      flexibleHours: employees.flexibleHours,
      paidHolidays: employees.paidHolidays,
      punchAnywhere: employees.punchAnywhere,
      shiftId: employees.shiftId,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .where(roleFilter === "admin" ? eq(employees.role, "admin") : sql`${employees.role} != 'admin'`)
    .orderBy(desc(employees.createdAt))
    .all();

  // Fetch branch assignments for all employees in one query
  const allAssignments = db
    .select({ employeeId: employeeBranches.employeeId, branchId: employeeBranches.branchId })
    .from(employeeBranches)
    .all();

  const assignmentsByEmp = new Map<string, string[]>();
  for (const a of allAssignments) {
    const list = assignmentsByEmp.get(a.employeeId) || [];
    list.push(a.branchId);
    assignmentsByEmp.set(a.employeeId, list);
  }

  const enriched = records.map((emp) => ({
    ...emp,
    assignedBranchIds: assignmentsByEmp.get(emp.id) || [],
  }));

  return Response.json({ employees: enriched });
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
    companyName?: string;
    employeeAddress?: string;
    monthlySalary?: number;
    hourlyRate?: number;
    active?: boolean;
    flexibleHours?: boolean;
    paidHolidays?: boolean;
    punchAnywhere?: boolean;
    assignedBranchIds?: string[];
    /** Assign a shift template (copies its timings); null = custom timings */
    shiftId?: string | null;
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
  if (body.companyName !== undefined) updates.companyName = body.companyName.trim().slice(0, 120);
  if (body.employeeAddress !== undefined) updates.employeeAddress = body.employeeAddress.trim().slice(0, 400);
  if (body.monthlySalary !== undefined) updates.monthlySalary = Math.max(0, Math.round(Number(body.monthlySalary) || 0));
  if (body.hourlyRate !== undefined) updates.hourlyRate = Math.max(0, Math.round(Number(body.hourlyRate) || 0));
  if (body.active !== undefined) updates.active = body.active;
  if (body.flexibleHours !== undefined) updates.flexibleHours = body.flexibleHours;
  if (body.paidHolidays !== undefined) updates.paidHolidays = body.paidHolidays;
  if (body.punchAnywhere !== undefined) updates.punchAnywhere = body.punchAnywhere;

  // Sync branch assignments if provided
  if (body.assignedBranchIds !== undefined) {
    db.delete(employeeBranches).where(eq(employeeBranches.employeeId, body.id)).run();
    for (const branchId of body.assignedBranchIds) {
      db.insert(employeeBranches)
        .values({ id: randomUUID(), employeeId: body.id, branchId })
        .run();
    }
    // Derive office from first assigned branch
    if (body.assignedBranchIds.length > 0) {
      const firstBranch = db.select({ name: branches.name }).from(branches).where(eq(branches.id, body.assignedBranchIds[0])).get();
      if (firstBranch) updates.office = firstBranch.name;
    }
  }

  if (body.shiftId !== undefined) {
    if (body.shiftId === null || body.shiftId === "") {
      updates.shiftId = null;
    } else {
      const shift = db.select().from(shifts).where(eq(shifts.id, body.shiftId)).get();
      if (!shift) return Response.json({ error: "Shift not found." }, { status: 404 });
      updates.shiftId = shift.id;
      updates.workStartTime = shift.startTime;
      updates.workEndTime = shift.endTime;
    }
  } else if (updates.workStartTime !== undefined || updates.workEndTime !== undefined) {
    // Hand-edited timings that no longer match the assigned shift make the hours custom,
    // so a later edit of the shift won't overwrite them
    const current = db.select({ shiftId: employees.shiftId }).from(employees).where(eq(employees.id, body.id)).get();
    if (current?.shiftId) {
      const shift = db.select().from(shifts).where(eq(shifts.id, current.shiftId)).get();
      const start = (updates.workStartTime as string | undefined) ?? shift?.startTime;
      const end = (updates.workEndTime as string | undefined) ?? shift?.endTime;
      if (!shift || start !== shift.startTime || end !== shift.endTime) updates.shiftId = null;
    }
  }

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
    companyName?: string;
    employeeAddress?: string;
    flexibleHours?: boolean;
    assignedBranchIds?: string[];
    ruleOverrides?: { ruleId: string; value: string }[];
    monthlySalary?: number;
    hourlyRate?: number;
    shiftId?: string | null;
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
  let workStartTime = body.workStartTime || "09:00";
  let workEndTime = body.workEndTime || "18:00";
  const office = body.office?.trim() || "Bhayandar Office";
  const department = body.department?.trim() || "";
  const companyName = (body.companyName?.trim() || "").slice(0, 120);
  const flexibleHours = body.flexibleHours === true;
  const employeeAddress = (body.employeeAddress?.trim() || "").slice(0, 400);
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

  // A chosen shift template supplies the timings
  let shiftId: string | null = null;
  if (body.shiftId) {
    const shift = db.select().from(shifts).where(eq(shifts.id, body.shiftId)).get();
    if (!shift) return Response.json({ error: "Shift not found." }, { status: 404 });
    shiftId = shift.id;
    workStartTime = shift.startTime;
    workEndTime = shift.endTime;
  }

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

  // Resolve office name from assigned branches (first branch name for display)
  let resolvedOffice = office;
  const assignedBranchIds = body.assignedBranchIds || [];
  if (assignedBranchIds.length > 0) {
    const firstBranch = db.select({ name: branches.name }).from(branches).where(eq(branches.id, assignedBranchIds[0])).get();
    if (firstBranch) resolvedOffice = firstBranch.name;
  }

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
      office: resolvedOffice,
      department,
      companyName,
      employeeAddress,
      flexibleHours,
      shiftId,
      monthlySalary: flexibleHours ? 0 : Math.max(0, Math.round(Number(body.monthlySalary) || 0)),
      hourlyRate: flexibleHours ? Math.max(0, Math.round(Number(body.hourlyRate) || 0)) : 0,
    })
    .run();

  // Insert branch assignments
  for (const branchId of assignedBranchIds) {
    db.insert(employeeBranches)
      .values({ id: randomUUID(), employeeId: id, branchId })
      .run();
  }

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
    { id, name, email, role, jobRole, mobileNumber, workStartTime, workEndTime, office, department, companyName },
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
  db.delete(employeeBranches).where(eq(employeeBranches.employeeId, body.id)).run();
  db.delete(sessions).where(eq(sessions.employeeId, body.id)).run();
  db.delete(dailyJournals).where(eq(dailyJournals.employeeId, body.id)).run();
  db.delete(otpRequests).where(eq(otpRequests.employeeId, body.id)).run();

  // Delete the employee
  db.delete(employees).where(eq(employees.id, body.id)).run();

  return Response.json({ ok: true });
}
