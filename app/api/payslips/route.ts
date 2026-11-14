import { getAppIdentity } from "../../authz";
import { getEmployeePayslip, isValidMonth, listEmployeePayslips } from "../../../lib/payslips";
import { runPayslipScheduleSafely } from "../../../lib/payslip-schedule";

/**
 * The signed-in employee's own published payslips.
 * No params: list of months. ?month=YYYY-MM: that month's payslip.
 */
export async function GET(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) return Response.json({ error: "Not authenticated." }, { status: 401 });
  // Catch up on the automatic publish / withdraw in case the hourly timer hasn't run yet
  runPayslipScheduleSafely();

  const month = new URL(request.url).searchParams.get("month");
  if (!month) return Response.json({ payslips: listEmployeePayslips(identity.employeeId) });
  if (!isValidMonth(month)) return Response.json({ error: "month must be YYYY-MM." }, { status: 400 });

  const payslip = getEmployeePayslip(identity.employeeId, month);
  if (!payslip) return Response.json({ error: "No payslip published for this month yet." }, { status: 404 });
  return Response.json({ payslip }, { headers: { "Cache-Control": "no-store" } });
}
