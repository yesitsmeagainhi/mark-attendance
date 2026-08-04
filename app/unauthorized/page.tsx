import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function UnauthorizedPage({ searchParams }: { searchParams: Promise<{ portal?: string }> }) { const { portal } = await searchParams; return <main className="login-page"><section className="denied-card"><span className="denied-icon">!</span><p className="eyebrow">Access denied</p><h1>Account not authorized</h1><p>This account is not registered for the {portal === "admin" ? "administrator" : "employee"} dashboard. Contact your administrator to add the correct email and role.</p><div className="denied-actions"><Link className="primary login-link" href="/">Choose another portal</Link><Link className="secondary login-link" href="/login">Sign in with different account</Link></div></section></main>; }
