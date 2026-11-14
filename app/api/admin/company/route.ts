import { requireApiRole } from "../../../authz";
import { getCompanyDetails, saveCompanyDetails } from "../../../../lib/company";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;
  // Company names already given to staff, for suggestions when adding / editing an employee
  const used = getDb().selectDistinct({ name: employees.companyName }).from(employees).all()
    .map((r) => r.name.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return Response.json({ ...getCompanyDetails(), companies: used });
}

/** { name, address } — shown at the top of every payslip */
export async function PUT(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;
  let body: { name?: string; address?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const name = (body.name ?? "").trim().slice(0, 120);
  const address = (body.address ?? "").trim().slice(0, 400);
  if (!name) return Response.json({ error: "Company name is required." }, { status: 400 });
  saveCompanyDetails({ name, address });
  return Response.json({ ok: true, name, address });
}
