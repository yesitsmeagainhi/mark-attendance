"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "choose" | "admin" | "employee-request" | "employee-verify";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = searchParams.get("mode") === "admin"
    ? "admin" as Mode
    : searchParams.get("mode") === "employee"
      ? "employee-request" as Mode
      : "choose" as Mode;

  const [mode, setMode] = useState<Mode>(initialMode);

  // Admin login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Employee OTP state
  const [mobileNumber, setMobileNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");

  // Shared state
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  async function handleAdminLogin(e: React.FormEvent) {
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

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNumber }),
      });
      const data = await res.json() as { error?: string; ok?: boolean; employeeId?: string; employeeName?: string };

      if (!res.ok) {
        setError(data.error || "Could not request OTP.");
        return;
      }

      setEmployeeId(data.employeeId || "");
      setEmployeeName(data.employeeName || "");
      setSuccess("OTP generated! Please ask your admin for the code.");
      setMode("employee-verify");
    } catch {
      setError("Could not connect to server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, otpCode }),
      });
      const data = await res.json() as { error?: string; role?: string };

      if (!res.ok) {
        setError(data.error || "Verification failed.");
        return;
      }

      router.push("/employee");
    } catch {
      setError("Could not connect to server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setError("");
    setSuccess("");
  }, [mode]);

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-brand">
          <span className="brandmark">A</span>
          <span>Attendly</span>
        </div>

        {mode === "choose" && (
          <>
            <p className="eyebrow">Secure attendance access</p>
            <h1>Sign in to your account</h1>
            <p className="login-intro">
              Choose how you&apos;d like to sign in. Employees use OTP verification,
              administrators use email and password.
            </p>
            <div className="login-options">
              <article>
                <span className="login-icon">&#9678;</span>
                <h2>Employee</h2>
                <p>Sign in with your registered mobile number. Your admin will provide an OTP.</p>
                <button className="primary login-link" onClick={() => setMode("employee-request")}>
                  Continue with OTP
                </button>
              </article>
              <article className="admin-login-card">
                <span className="login-icon">&#9638;</span>
                <h2>Administrator</h2>
                <p>Sign in with your registered email and password.</p>
                <button className="primary login-link" onClick={() => setMode("admin")}>
                  Continue with password
                </button>
              </article>
            </div>
          </>
        )}

        {mode === "admin" && (
          <>
            <p className="eyebrow">Admin login</p>
            <h1>Sign in as administrator</h1>
            <p className="login-intro">Enter your registered email and password.</p>

            <form className="login-form" onSubmit={handleAdminLogin}>
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com"
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

            <button className="login-back" onClick={() => setMode("choose")}>
              &larr; Back to login options
            </button>
          </>
        )}

        {mode === "employee-request" && (
          <>
            <p className="eyebrow">Employee login</p>
            <h1>Sign in with OTP</h1>
            <p className="login-intro">
              Enter your registered mobile number.
              An OTP will be generated for your admin to share with you.
            </p>

            <form className="login-form" onSubmit={handleRequestOtp}>
              <label>
                <span>Mobile number</span>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="Enter your mobile number"
                  required
                />
              </label>
              {error && <p className="form-message">{error}</p>}
              <button className="primary login-link" type="submit" disabled={loading}>
                {loading ? "Requesting OTP..." : "Request OTP"}
              </button>
            </form>

            <button className="login-back" onClick={() => setMode("choose")}>
              &larr; Back to login options
            </button>
          </>
        )}

        {mode === "employee-verify" && (
          <>
            <p className="eyebrow">Employee login</p>
            <h1>Enter your OTP</h1>
            <p className="login-intro">
              Hi <b>{employeeName}</b>, an OTP has been generated.
              Please ask your admin for the 6-digit code.
            </p>

            <form className="login-form" onSubmit={handleVerifyOtp}>
              {success && <p className="form-message success-text">{success}</p>}
              <label>
                <span>OTP Code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit OTP"
                  required
                  autoFocus
                  className="otp-input"
                />
              </label>
              {error && <p className="form-message">{error}</p>}
              <button className="primary login-link" type="submit" disabled={loading || otpCode.length < 6}>
                {loading ? "Verifying..." : "Verify & Sign in"}
              </button>
              <button
                type="button"
                className="secondary login-link"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setOtpCode("");
                  setError("");
                  setSuccess("");
                  setMode("employee-request");
                }}
              >
                Request new OTP
              </button>
            </form>

            <button className="login-back" onClick={() => setMode("choose")}>
              &larr; Back to login options
            </button>
          </>
        )}

        <p className="login-security">
          You&apos;ll stay logged in until you sign out or log in from another device.
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
