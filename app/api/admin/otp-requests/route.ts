import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees, otpRequests } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const db = getDb();
  const now = new Date().toISOString();

  // Expire OTPs that have passed their expiry time
  db.update(otpRequests)
    .set({ status: "expired" })
    .where(
      and(
        eq(otpRequests.status, "pending"),
        sql`${otpRequests.expiresAt} <= ${now}`,
      ),
    )
    .run();

  // Fetch remaining pending OTPs
  const pending = db
    .select({
      id: otpRequests.id,
      employeeId: otpRequests.employeeId,
      employeeName: employees.name,
      otpCode: otpRequests.otpCode,
      createdAt: otpRequests.createdAt,
      expiresAt: otpRequests.expiresAt,
    })
    .from(otpRequests)
    .innerJoin(employees, eq(otpRequests.employeeId, employees.id))
    .where(eq(otpRequests.status, "pending"))
    .orderBy(desc(otpRequests.createdAt))
    .all();

  return Response.json({ otpRequests: pending });
}
