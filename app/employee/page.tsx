import { redirect } from "next/navigation";
import DashboardClient from "../dashboard-client";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getAppIdentity } from "../authz";
export const dynamic = "force-dynamic";
export default async function EmployeePage() { await requireChatGPTUser("/employee"); const identity = await getAppIdentity(); if (!identity) redirect("/unauthorized?portal=employee"); return <DashboardClient view="employee" employeeId={identity.employeeId} displayName={identity.displayName} role={identity.role} />; }
