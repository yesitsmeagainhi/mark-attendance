"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  month: string;
  canPublish: boolean;
  published: boolean;
  count: number;
  publishedAt: string | null;
  auto: {
    enabled: boolean;
    /** Day of the month payslips are withdrawn; 0 = never */
    withdrawDay: number;
    publishOn: string;
    withdrawOn: string | null;
    autoPublishedAt: string | null;
    autoWithdrawnAt: string | null;
  };
};

const WITHDRAW_DAYS = Array.from({ length: 27 }, (_, i) => i + 2); // 2nd–28th

function ordinal(n: number) {
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/** Today's day of the month in India */
function todayDayIST() {
  return Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(8, 10));
}

function label(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
function day(d: string) {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Reports tab: payslip status for the month, the automatic schedule, and manual publish / withdraw. */
export default function PayslipPublishBar({ month }: { month: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/payslips?month=${month}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => setStatus(d))
      .catch(() => setStatus(null));
  }, [month]);

  // Remounted per month (keyed by month), so the message starts empty
  useEffect(() => { load(); }, [load]);

  async function act(method: "POST" | "DELETE") {
    const name = label(month);
    const question = method === "DELETE"
      ? `Withdraw the ${name} payslips now? Employees will no longer see them.`
      : status?.published
        ? `Re-publish ${name}? Employees' payslips are replaced with the current figures.`
        : `Publish ${name} payslips now? Each employee will see their salary for this month in their panel.`;
    if (!confirm(question)) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/payslips", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; count?: number };
      if (!res.ok) { setMessage(data.error || "Something went wrong."); return; }
      setMessage(method === "DELETE" ? "Payslips withdrawn." : `Published for ${data.count} employee(s).`);
      load();
    } catch {
      setMessage("Could not connect to server.");
    } finally {
      setBusy(false);
    }
  }

  async function changeWithdrawDay(next: number) {
    if (!status) return;
    // Picking a day that has already passed this month withdraws the visible payslips straight away
    const willWithdrawNow = next !== 0 && status.auto.autoPublishedAt && !status.auto.autoWithdrawnAt && status.published && next <= todayDayIST();
    const question = next === 0
      ? "Keep payslips visible until you withdraw them by hand?"
      : willWithdrawNow
        ? `Withdraw payslips on the ${ordinal(next)} from now on? That day has already passed this month, so the ${label(month)} payslips will be withdrawn right away.`
        : `Withdraw payslips automatically on the ${ordinal(next)} of each month?`;
    if (!confirm(question)) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/payslips", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawDay: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setMessage(data.error || "Something went wrong."); return; }
      setMessage(next === 0 ? "Payslips will stay visible until withdrawn by hand." : `Payslips will be withdrawn on the ${ordinal(next)}.`);
      load();
    } catch {
      setMessage("Could not connect to server.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAuto() {
    if (!status) return;
    const enable = !status.auto.enabled;
    if (!enable && !confirm("Turn off automatic payslips? You'll need to publish and withdraw them by hand.")) return;
    setBusy(true);
    try {
      await fetch("/api/admin/payslips", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoEnabled: enable }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  const a = status.auto;

  // What the automatic schedule does / did for this month
  let autoText: string;
  if (!a.enabled) autoText = "Automatic payslips are off.";
  else if (a.autoWithdrawnAt) autoText = `Shown automatically from ${day(a.publishOn)}, withdrawn ${day(a.autoWithdrawnAt)}.`;
  else if (a.autoPublishedAt) autoText = a.withdrawOn ? `Published automatically; withdrawn automatically on ${day(a.withdrawOn)}.` : "Published automatically; stays visible until withdrawn by hand.";
  else if (!status.canPublish) autoText = a.withdrawOn
    ? `Will publish automatically on ${day(a.publishOn)} and withdraw on ${day(a.withdrawOn)}.`
    : `Will publish automatically on ${day(a.publishOn)} and stay visible until withdrawn by hand.`;
  else autoText = "Outside the automatic window; publish by hand if needed.";

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 16,
      background: status.published ? "#e8f7ef" : "#f6f3ff", border: `1px solid ${status.published ? "#bbe5cd" : "#e4dcff"}`, borderRadius: 14,
    }}>
      <span style={{ fontSize: 18 }}>{"\u{1F4B0}"}</span>
      <div style={{ flex: "1 1 240px", fontSize: 14, minWidth: 0 }}>
        <b>Payslips &middot; {label(month)}</b>
        <div style={{ color: "#667085" }}>
          {status.published
            ? `Visible to ${status.count} employee(s) since ${new Date(status.publishedAt!).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}.`
            : "Not visible to employees."}{" "}
          {autoText}
        </div>
        {message && <div style={{ color: message.includes("wrong") || message.includes("connect") || message.includes("once") ? "#c73333" : "#168052", fontWeight: 600, marginTop: 2 }}>{message}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={toggleAuto}
          disabled={busy}
          aria-pressed={a.enabled}
          title={a.withdrawDay ? `Publish last month's payslips on the 1st and withdraw them on the ${ordinal(a.withdrawDay)}` : "Publish last month's payslips on the 1st"}
          style={{ border: "1px solid var(--line)", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", color: a.enabled ? "#168052" : "#667085" }}
        >
          Auto {a.enabled ? "on" : "off"}
        </button>
        {a.enabled && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#475467", margin: 0 }}>
            Withdraw on
            <select
              value={a.withdrawDay}
              onChange={(e) => changeWithdrawDay(Number(e.target.value))}
              disabled={busy}
              aria-label="Day of the month payslips are withdrawn"
              style={{ border: "1px solid var(--line)", background: "#fff", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontWeight: 700, color: "var(--ink)", width: "auto", minWidth: 0 }}
            >
              {WITHDRAW_DAYS.map((d) => <option key={d} value={d}>{ordinal(d)} of month</option>)}
              <option value={0}>Never (withdraw by hand)</option>
            </select>
          </label>
        )}
        {status.canPublish && (
          <>
            <button type="button" className="btn-approve" style={{ fontSize: 14 }} disabled={busy} onClick={() => act("POST")}>
              {busy ? "..." : status.published ? "Re-publish" : "Publish now"}
            </button>
            {status.published && (
              <button type="button" className="btn-reject" style={{ fontSize: 14 }} disabled={busy} onClick={() => act("DELETE")}>Withdraw</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
