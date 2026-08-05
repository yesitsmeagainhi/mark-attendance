import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";

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
      createdAt: employees.createdAt,
    })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  if (!emp) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  return Response.json({ profile: emp });
}
