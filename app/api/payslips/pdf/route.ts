import { getAppIdentity } from "../../../authz";
import { getEmployeePayslip, isValidMonth } from "../../../../lib/payslips";
import { payslipFileName, payslipPdfBytes } from "../../../../lib/reports/generate-payslip-pdf";

export const runtime = "nodejs";

/**
 * The signed-in employee's own published payslip as a PDF: ?month=YYYY-MM.
 * Same layout as the web panel's "Download PDF" (shared generator), so the
 * mobile app can save it. Identity always comes from the session, never a param.
 */
export async function GET(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const month = new URL(request.url).searchParams.get("month");
  if (!month || !isValidMonth(month)) {
    return Response.json({ error: "month must be YYYY-MM." }, { status: 400 });
  }

  const payslip = getEmployeePayslip(identity.employeeId, month);
  if (!payslip) {
    return Response.json({ error: "No payslip published for this month yet." }, { status: 404 });
  }

  const bytes = await payslipPdfBytes(payslip);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payslipFileName(payslip)}"`,
      "Cache-Control": "no-store",
    },
  });
}
