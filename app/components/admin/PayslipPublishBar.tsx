"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  month: string;
  canPublish: boolean;
  published: boolean;
  count: number;
  publishedAt: string | null;
  auto: { enabled: boolean; publishOn: string; withdrawOn: string; autoPublishedAt: string | null; autoWithdrawnAt: string | null };
};

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
  else if (a.autoWithdrawnAt) autoText = `Shown automatically ${day(a.publishOn)} – ${day(a.withdrawOn)}, now withdrawn.`;
  else if (a.autoPublishedAt) autoText = `Published automatically; withdrawn automatically on ${day(a.withdrawOn)}.`;
  else if (!status.canPublish) autoText = `Will publish automatically on ${day(a.publishOn)} and withdraw on ${day(a.withdrawOn)}.`;
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
          title="Publish last month's payslips on the 1st and withdraw them on the 15th"
          style={{ border: "1px solid var(--line)", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", color: a.enabled ? "#168052" : "#667085" }}
        >
          Auto {a.enabled ? "on" : "off"}
        </button>
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
