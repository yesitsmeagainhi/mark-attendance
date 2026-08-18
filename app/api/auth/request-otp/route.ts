import { randomUUID, randomInt } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees, otpRequests } from "../../../../db/schema";

export async function POST(request: Request) {
  let body: { mobileNumber?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const mobileNumber = body.mobileNumber?.trim().replace(/\D/g, "");

  if (!mobileNumber) {
    return Response.json(
      { error: "Mobile number is required." },
      { status: 400 },
    );
  }

  const db = getDb();
  const employee = db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(
      and(
        eq(employees.mobileNumber, mobileNumber),
        eq(employees.active, true),
        sql`${employees.role} != 'admin'`,
      ),
    )
    .limit(1)
    .get();

  if (!employee) {
    return Response.json(
      { error: "No employee found with this mobile number. Please check and try again, or contact your admin." },
      { status: 404 },
    );
  }

  // Expire any existing pending OTPs for this employee
  db.update(otpRequests)
    .set({ status: "expired" })
    .where(
      and(
        eq(otpRequests.employeeId, employee.id),
        eq(otpRequests.status, "pending"),
      ),
    )
    .run();

  // Generate 6-digit OTP
  const otpCode = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.insert(otpRequests).values({
    id: randomUUID(),
    employeeId: employee.id,
    otpCode,
    status: "pending",
    expiresAt,
  }).run();

  return Response.json({
    ok: true,
    employeeId: employee.id,
    employeeName: employee.name,
  });
}
