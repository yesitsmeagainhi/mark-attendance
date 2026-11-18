import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";
import { getCompanyDetails } from "../../../../lib/company";

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
      profilePhotoKey: employees.profilePhotoKey,
      companyName: employees.companyName,
    })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  if (!emp) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  const { profilePhotoKey, companyName, ...rest } = emp;
  const photoUrl = profilePhotoKey ? "/api/employee/profile/photo" : null;
  // Same rule as payslips: the employee's own company if the admin set one,
  // otherwise the default from Settings → Company details. "" when neither is set.
  const company = companyName.trim() || getCompanyDetails().name.trim();

  return Response.json({ profile: { ...rest, companyName: company, photoUrl } });
}
