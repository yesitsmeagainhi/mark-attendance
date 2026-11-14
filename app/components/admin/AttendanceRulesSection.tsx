"use client";

import { useEffect, useState } from "react";
import { groupByCategory, ruleUnit } from "./rule-meta";

type Rule = {
  id: string;
  label: string;
  description: string | null;
  valueType: "number" | "boolean";
  defaultValue: string;
  category?: string;
};

/** Company-wide rule defaults, grouped by category, with a live salary-formula summary. */
export default function AttendanceRulesSection() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function fetchRules() {
    fetch("/api/admin/rules")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.rules) setRules(data.rules); })
      .catch(() => undefined);
  }

  useEffect(() => { fetchRules(); }, []);

  async function saveRule(rule: Rule, value: string) {
    if (value === rule.defaultValue) {
      setDrafts((d) => { const n = { ...d }; delete n[rule.id]; return n; });
      return;
    }
    setSaving(rule.id);
    setError("");
    try {
      const res = await fetch("/api/admin/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: rule.id, defaultValue: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(`${rule.label}: ${data.error || "could not save."}`);
        return;
      }
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, defaultValue: value } : r)));
      setDrafts((d) => { const n = { ...d }; delete n[rule.id]; return n; });
      setSavedId(rule.id);
      setTimeout(() => setSavedId((s) => (s === rule.id ? null : s)), 1500);
    } catch {
      setError("Could not connect to server.");
    } finally {
      setSaving(null);
    }
  }

  const val = (id: string) => rules.find((r) => r.id === id)?.defaultValue ?? "";
  const overtimeOn = val("overtime_enabled") === "true";

  return (
    <>
      <SalaryFormula val={val} loaded={rules.length > 0} />

      {error && <p className="form-message" style={{ marginTop: 16 }}>{error}</p>}

      {groupByCategory(rules).map((group) => (
        <section key={group.id} className="table-card" style={{ marginTop: 20 }}>
          <div className="table-tools" style={{ paddingBottom: 6 }}>
            <div>
              <h2>{group.title}</h2>
              <p>{group.hint}</p>
            </div>
          </div>
          <div>
            {group.items.map((rule) => {
              const { unit, step } = ruleUnit(rule.id);
              const dimmed = group.id === "overtime" && rule.id !== "overtime_enabled" && !overtimeOn;
              const draft = drafts[rule.id];
              return (
                <div
                  key={rule.id}
                  style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
                    padding: "14px 22px", borderTop: "1px solid #f0f0f3", opacity: dimmed ? 0.5 : 1,
                  }}
                >
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{rule.label}</div>
                    {rule.description && <small style={{ color: "#6b7280", display: "block", marginTop: 2 }}>{rule.description}</small>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {rule.valueType === "boolean" ? (
                      <button
                        type="button"
                        className={rule.defaultValue === "true" ? "btn-approve" : "btn-reject"}
                        style={{ fontSize: 14, minWidth: 92 }}
                        disabled={saving === rule.id}
                        onClick={() => saveRule(rule, rule.defaultValue === "true" ? "false" : "true")}
                        aria-pressed={rule.defaultValue === "true"}
                      >
                        {rule.defaultValue === "true" ? "✓ On" : "Off"}
                      </button>
                    ) : (
                      <>
                        {unit === "₹" && <span style={{ color: "#667085", fontWeight: 700 }}>{unit}</span>}
                        <input
                          className="salary-input"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={step}
                          value={draft ?? rule.defaultValue}
                          disabled={saving === rule.id}
                          aria-label={rule.label}
                          onChange={(e) => setDrafts((d) => ({ ...d, [rule.id]: e.target.value }))}
                          onBlur={(e) => saveRule(rule, e.target.value.trim())}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setDrafts((d) => { const n = { ...d }; delete n[rule.id]; return n; });
                          }}
                          style={{ width: 90 }}
                        />
                        {unit !== "₹" && <span style={{ color: "#667085", fontSize: 13, minWidth: 34 }}>{unit}</span>}
                      </>
                    )}
                    <span style={{ fontSize: 12, color: "#168052", fontWeight: 700, width: 44 }}>
                      {saving === rule.id ? "…" : savedId === rule.id ? "Saved" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {rules.length > 0 && (
        <p style={{ fontSize: 13, color: "#8990a0", marginTop: 14 }}>
          These are company-wide defaults. To give one employee different rules, go to Staff &rarr; employee menu &rarr; Rules.
        </p>
      )}
    </>
  );
}

/** Plain-language summary of how net pay is worked out with the current rules. */
function SalaryFormula({ val, loaded }: { val: (id: string) => string; loaded: boolean }) {
  if (!loaded) {
    return <section className="table-card" style={{ padding: 24, color: "#8990a0" }}>Loading rules...</section>;
  }
  const n = (id: string) => Number(val(id)) || 0;
  const days = (x: number) => (x === 1 ? "1 day" : `${x} days`);

  const lateCount = n("late_to_absent_count");
  const lateFine = n("late_fine_amount");
  const lateLine = lateCount > 0
    ? `Every ${lateCount} late marks → −${days(n("late_penalty_days"))}${lateFine > 0 ? `, plus ₹${lateFine} fine per late mark` : ""}`
    : lateFine > 0 ? `₹${lateFine} fine per late mark` : "No late penalty";

  const otLine = val("overtime_enabled") === "true"
    ? `Work beyond the shift${n("shift_break_minutes") > 0 ? ` minus its ${n("shift_break_minutes")}-min break` : ""} (at least ${n("overtime_min_minutes")} min/day), paid at ${n("overtime_rate_multiplier")}× the hourly rate (per-day pay ÷ working hours)${n("overtime_max_hours_month") > 0 ? `, up to ${n("overtime_max_hours_month")} h/month` : ""}`
    : "Overtime is not paid";

  const leaveLine = (["sick", "casual", "earned"] as const).map((t) => {
    const name = t[0].toUpperCase() + t.slice(1);
    if (val(`leave_${t}_paid`) !== "true") return `${name}: unpaid`;
    const q = n(`leave_${t}_quota`);
    return `${name}: ${q > 0 ? `${q} paid/yr` : "unlimited paid"}`;
  }).join(" · ");

  const lines: [string, string][] = [
    ["Per-day rate", "Monthly salary ÷ days in the month"],
    ["Absent / short day", "−1 day"],
    ["Half day", `−${days(n("half_day_deduction"))}`],
    ["Late marks", lateLine],
    ["Leave", leaveLine],
    ["Unpaid holiday", "−1 day"],
    ["Week-off worked", "+1 day"],
    ["Overtime", otLine],
  ];

  return (
    <section className="table-card">
      <div className="table-tools" style={{ paddingBottom: 8 }}>
        <div>
          <h2>How salary is calculated</h2>
          <p>Net pay = monthly salary &minus; deductions + extra pay. Updates as you change the rules below. Hourly (flexible) staff are paid hours &times; rate.</p>
        </div>
      </div>
      <dl style={{ margin: 0, padding: "0 22px 18px", display: "grid", gridTemplateColumns: "minmax(110px, auto) 1fr", gap: "8px 16px", fontSize: 14 }}>
        {lines.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt style={{ color: "#667085", fontWeight: 600 }}>{k}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
