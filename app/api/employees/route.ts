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
      office: employees.office,
      active: employees.active,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .orderBy(desc(employees.createdAt))
    .all();

  return Response.json({ employees: records });
}

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
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
  const office = body.office?.trim() || "Airoli Office";

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
      office,
    })
    .run();

  return Response.json(
    { id, name, email, role, office },
    { status: 201 },
  );
}
