"use client";

import { useEffect, useState } from "react";
import { groupByCategory, ruleUnit } from "./rule-meta";

type RuleOverride = {
  ruleId: string;
  label: string;
  description: string | null;
  valueType: "number" | "boolean";
  category?: string;
  globalDefault: string;
  override: string | null;
  effectiveValue: string;
};

type Props = {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
};

export default function EmployeeRulesModal({ open, employeeId, employeeName, onClose }: Props) {
  const [rules, setRules] = useState<RuleOverride[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  function fetchRules() {
    fetch(`/api/admin/employee-rules?employeeId=${encodeURIComponent(employeeId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.rules) setRules(data.rules); })
      .catch(() => undefined);
  }

  useEffect(() => {
    if (open) fetchRules();
  }, [open, employeeId]);

  async function setOverride(ruleId: string, value: string) {
    setSaving(ruleId);
    setError("");
    try {
      const res = await fetch("/api/admin/employee-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, ruleId, value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not save.");
      }
      fetchRules();
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  }

  async function clearOverride(ruleId: string) {
    setSaving(ruleId);
    try {
      await fetch("/api/admin/employee-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, ruleId }),
      });
      fetchRules();
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  }

  function commitNumber(rule: RuleOverride, value: string) {
    if (value === rule.globalDefault) {
      if (rule.override !== null) clearOverride(rule.ruleId);
      return;
    }
    setOverride(rule.ruleId, value);
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Rules for {employeeName}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div style={{ padding: "0 24px 24px" }}>
          {rules.length === 0 && <p style={{ color: "#8990a0", textAlign: "center", padding: 20 }}>Loading...</p>}
          {error && <p className="form-message">{error}</p>}
          {groupByCategory(rules).map((group) => (
            <div key={group.id}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "#6d45e5", marginTop: 18 }}>{group.title}</div>
          {group.items.map((rule) => (
            <div key={rule.ruleId} style={{ borderBottom: "1px solid #f0f0f3", padding: "14px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong style={{ fontSize: 16 }}>{rule.label}</strong>
                {rule.override !== null && (
                  <button
                    style={{ fontSize: 13, color: "#6366f1", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => clearOverride(rule.ruleId)}
                    disabled={saving === rule.ruleId}
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <small style={{ color: "#6b7280", display: "block", marginBottom: 8 }}>{rule.description}</small>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14, color: "#9ca3af" }}>Default: {rule.valueType === "boolean" ? (rule.globalDefault === "true" ? "Enabled" : "Disabled") : rule.globalDefault}</span>
                <span style={{ color: "#d1d5db" }}>|</span>
                {rule.valueType === "boolean" ? (
                  <button
                    className={rule.effectiveValue === "true" ? "btn-approve" : "btn-reject"}
                    style={{ fontSize: 14 }}
                    onClick={() => setOverride(rule.ruleId, rule.effectiveValue === "true" ? "false" : "true")}
                    disabled={saving === rule.ruleId}
                  >
                    {rule.effectiveValue === "true" ? "Enabled" : "Disabled"}
                  </button>
                ) : (
                  <input
                    type="number"
                    className="salary-input"
                    value={rule.override ?? rule.globalDefault}
                    onChange={(e) => {
                      setRules((prev) =>
                        prev.map((r) =>
                          r.ruleId === rule.ruleId ? { ...r, override: e.target.value, effectiveValue: e.target.value } : r,
                        ),
                      );
                    }}
                    onBlur={(e) => commitNumber(rule, e.target.value.trim())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    style={{ width: 80 }}
                  />
                )}
                {rule.valueType === "number" && ruleUnit(rule.ruleId).unit && (
                  <span style={{ fontSize: 13, color: "#667085" }}>{ruleUnit(rule.ruleId).unit}</span>
                )}
                {rule.override !== null && (
                  <span className="grace-badge grace" style={{ fontSize: 13 }}>Overridden</span>
                )}
              </div>
            </div>
          ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
