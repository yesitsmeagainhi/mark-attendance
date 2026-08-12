import Link from "next/link";

export default function Home() {
  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-brand">
          <span className="brandmark">A</span>
          <span>Attendly</span>
        </div>
        <p className="eyebrow">Secure attendance access</p>
        <h1>Choose your login</h1>
        <p className="login-intro">
          Employees and administrators have separate protected dashboards.
          Your account role determines which area you can open.
        </p>
        <div className="login-options">
          <article>
            <span className="login-icon">◎</span>
            <h2>Employee login</h2>
            <p>
              Take your attendance selfie, punch in or out, and view your
              own attendance.
            </p>
            <Link className="primary login-link" href="/login?mode=employee">
              Continue with OTP
            </Link>
          </article>
          <article className="admin-login-card">
            <span className="login-icon">▦</span>
            <h2>Admin login</h2>
            <p>
              Review employee records, timestamps, attendance status, and
              stored selfies.
            </p>
            <Link className="primary login-link" href="/login?mode=admin">
              Continue with password
            </Link>
          </article>
        </div>
        <p className="login-security">
          Role access is checked securely on the server. Employees cannot
          open the admin dashboard.
        </p>
      </section>
    </main>
  );
}
