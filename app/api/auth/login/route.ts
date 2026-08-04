import { createHash } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";

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

  const cookieStore = await cookies();
  cookieStore.set("session", record.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return Response.json({
    role: record.role,
    name: record.name,
  });
}
