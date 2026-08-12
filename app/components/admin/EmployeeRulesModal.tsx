"use client";

import { useEffect, useState } from "react";

type RuleOverride = {
  ruleId: string;
  label: string;
  description: string | null;
  valueType: "number" | "boolean";
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
    try {
      await fetch("/api/admin/employee-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, ruleId, value }),
      });
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
          {rules.map((rule) => (
            <div key={rule.ruleId} style={{ borderBottom: "1px solid #f0f0f3", padding: "14px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>{rule.label}</strong>
                {rule.override !== null && (
                  <button
                    style={{ fontSize: 11, color: "#6366f1", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => clearOverride(rule.ruleId)}
                    disabled={saving === rule.ruleId}
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <small style={{ color: "#6b7280", display: "block", marginBottom: 8 }}>{rule.description}</small>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>Default: {rule.valueType === "boolean" ? (rule.globalDefault === "true" ? "Enabled" : "Disabled") : rule.globalDefault}</span>
                <span style={{ color: "#d1d5db" }}>|</span>
                {rule.valueType === "boolean" ? (
                  <button
                    className={rule.effectiveValue === "true" ? "btn-approve" : "btn-reject"}
                    style={{ fontSize: 12 }}
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
                    onBlur={(e) => {
                      if (e.target.value !== rule.globalDefault) {
                        setOverride(rule.ruleId, e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const target = e.target as HTMLInputElement;
                        if (target.value !== rule.globalDefault) {
                          setOverride(rule.ruleId, target.value);
                        }
                      }
                    }}
                    style={{ width: 80 }}
                  />
                )}
                {rule.override !== null && (
                  <span className="grace-badge grace" style={{ fontSize: 11 }}>Overridden</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
