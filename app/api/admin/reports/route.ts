import { requireApiRole } from "../../../authz";
import { buildMonthlyReport } from "../../../../lib/monthly-report";

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const now = new Date();
  const month = url.searchParams.get("month") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return Response.json(buildMonthlyReport(month));
}
