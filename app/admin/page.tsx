import { redirect } from "next/navigation";
import DashboardClient from "../dashboard-client";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getAppIdentity } from "../authz";
export const dynamic = "force-dynamic";
export default async function AdminPage() { await requireChatGPTUser("/admin"); const identity = await getAppIdentity(); if (!identity) redirect("/unauthorized?portal=admin"); if (identity.role !== "admin") redirect("/employee"); return <DashboardClient view="admin" employeeId={identity.employeeId} displayName={identity.displayName} role={identity.role} />; }
