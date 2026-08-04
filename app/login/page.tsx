"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { error?: string; role?: string };

      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      router.push(data.role === "admin" ? "/admin" : "/employee");
    } catch {
      setError("Could not connect to server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-brand">
          <span className="brandmark">A</span>
          <span>Attendly</span>
        </div>
        <p className="eyebrow">Secure attendance access</p>
        <h1>Sign in to your account</h1>
        <p className="login-intro">
          Enter your registered email and password to access your dashboard.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
              autoFocus
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </label>
          {error && <p className="form-message">{error}</p>}
          <button className="primary login-link" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="login-security">
          Your password is verified securely on the server. Sessions expire after 24 hours.
        </p>
      </section>
    </main>
  );
}
