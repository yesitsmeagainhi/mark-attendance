import { createHash, randomUUID } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../../../../db";
import { employees, sessions } from "../../../../db/schema";
import { logActivity } from "../../../../lib/activity-logger";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return Response.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const db = getDb();
  const record = db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      password: employees.password,
      role: employees.role,
    })
    .from(employees)
    .where(
      and(sql`lower(${employees.email}) = ${email}`, eq(employees.active, true)),
    )
    .limit(1)
    .get();

  if (!record) {
    return Response.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const hash = createHash("sha256").update(password).digest("hex");
  if (hash !== record.password) {
    return Response.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  if (record.role !== "admin") {
    return Response.json(
      { error: "Employees must log in using OTP. Please use the employee login." },
      { status: 403 },
    );
  }

  // Atomic: invalidate old sessions + create new session
  const token = randomUUID();
  db.transaction((tx) => {
    tx.delete(sessions).where(eq(sessions.employeeId, record.id)).run();
    tx.insert(sessions).values({
      id: randomUUID(),
      employeeId: record.id,
      token,
      userAgent: request.headers.get("user-agent") || null,
    }).run();
  });

  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_HTTP_COOKIES !== "true",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year (persistent)
  });

  logActivity({
    actionType: "admin_login",
    performedBy: record.id,
    performedByName: record.name,
    description: `Admin ${record.name} signed in`,
  });

  return Response.json({
    role: record.role,
    name: record.name,
  });
}
