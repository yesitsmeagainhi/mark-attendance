import { randomUUID } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../../../../db";
import { employees, sessions, otpRequests } from "../../../../db/schema";
import { logActivity } from "../../../../lib/activity-logger";

export async function POST(request: Request) {
  let body: { employeeId?: string; otpCode?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const employeeId = body.employeeId?.trim();
  const otpCode = body.otpCode?.trim();

  if (!employeeId || !otpCode) {
    return Response.json(
      { error: "Employee ID and OTP code are required." },
      { status: 400 },
    );
  }

  const db = getDb();
  const now = new Date().toISOString();

  const otpRecord = db
    .select({ id: otpRequests.id })
    .from(otpRequests)
    .where(
      and(
        eq(otpRequests.employeeId, employeeId),
        eq(otpRequests.otpCode, otpCode),
        eq(otpRequests.status, "pending"),
        sql`${otpRequests.expiresAt} > ${now}`,
      ),
    )
    .limit(1)
    .get();

  if (!otpRecord) {
    return Response.json(
      { error: "Invalid or expired OTP. Please request a new one." },
      { status: 401 },
    );
  }

  // Atomic: mark OTP used + invalidate old sessions + create new session
  const token = randomUUID();
  db.transaction((tx) => {
    tx.update(otpRequests)
      .set({ status: "used" })
      .where(eq(otpRequests.id, otpRecord.id))
      .run();

    tx.delete(sessions).where(eq(sessions.employeeId, employeeId)).run();

    tx.insert(sessions).values({
      id: randomUUID(),
      employeeId,
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

  const emp = db
    .select({ name: employees.name, role: employees.role })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1)
    .get();

  logActivity({
    actionType: "employee_login",
    performedBy: employeeId,
    performedByName: emp?.name || employeeId,
    description: `Employee ${emp?.name || employeeId} signed in`,
  });

  return Response.json({
    role: emp?.role || "employee",
    name: emp?.name || "",
  });
}
