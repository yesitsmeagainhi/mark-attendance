import { createHash } from "node:crypto";
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { employees } from "../../../db/schema";
import { requireApiRole } from "../../authz";

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

  let body: { id?: string; monthlySalary?: number };
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

  if (body.monthlySalary !== undefined) {
    const salary = Math.max(0, Math.round(Number(body.monthlySalary) || 0));
    db.update(employees).set({ monthlySalary: salary }).where(eq(employees.id, body.id)).run();
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
    })
    .run();

  return Response.json(
    { id, name, email, role, jobRole, mobileNumber, workStartTime, workEndTime, office },
    { status: 201 },
  );
}
