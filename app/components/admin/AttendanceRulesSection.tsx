"use client";

import { useEffect, useState } from "react";

type Rule = {
  id: string;
  label: string;
  description: string | null;
  valueType: "number" | "boolean";
  defaultValue: string;
};

export default function AttendanceRulesSection() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  function fetchRules() {
    fetch("/api/admin/rules")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.rules) setRules(data.rules); })
      .catch(() => undefined);
  }

  useEffect(() => { fetchRules(); }, []);

  async function saveRule(ruleId: string, value: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId, defaultValue: value }),
      });
      setEditingRule(null);
      fetchRules();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function toggleBoolean(rule: Rule) {
    const newValue = rule.defaultValue === "true" ? "false" : "true";
    await saveRule(rule.id, newValue);
  }

  return (
    <section className="table-card" style={{ marginTop: 24 }}>
      <div className="table-tools">
        <div>
          <h2>Attendance Rules</h2>
          <p>Global defaults for all employees. To customize per employee, go to Staff &rarr; employee menu &rarr; Rules.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Description</th>
              <th>Default Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td><b>{rule.label}</b></td>
                <td><small style={{ color: "#6b7280" }}>{rule.description || "\u2014"}</small></td>
                <td>
                  {rule.valueType === "boolean" ? (
                    <span className={`grace-badge ${rule.defaultValue === "true" ? "on-time" : "absent"}`}>
                      {rule.defaultValue === "true" ? "Enabled" : "Disabled"}
                    </span>
                  ) : editingRule === rule.id ? (
                    <input
                      className="salary-input"
                      type="number"
                      step="0.5"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRule(rule.id, editValue);
                        if (e.key === "Escape") setEditingRule(null);
                      }}
                      autoFocus
                      disabled={saving}
                    />
                  ) : (
                    <span
                      style={{ cursor: "pointer", borderBottom: "1px dashed #c9cbd4", fontWeight: 600 }}
                      onClick={() => { setEditingRule(rule.id); setEditValue(rule.defaultValue); }}
                      title="Click to edit"
                    >
                      {rule.defaultValue}
                    </span>
                  )}
                </td>
                <td>
                  {rule.valueType === "boolean" ? (
                    <button
                      className={rule.defaultValue === "true" ? "btn-reject" : "btn-approve"}
                      style={{ fontSize: 12 }}
                      onClick={() => toggleBoolean(rule)}
                    >
                      {rule.defaultValue === "true" ? "Disable" : "Enable"}
                    </button>
                  ) : editingRule === rule.id ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn-approve"
                        style={{ fontSize: 12 }}
                        onClick={() => saveRule(rule.id, editValue)}
                        disabled={saving}
                      >
                        {saving ? "..." : "Save"}
                      </button>
                      <button
                        className="btn-reject"
                        style={{ fontSize: 12 }}
                        onClick={() => setEditingRule(null)}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-approve"
                      style={{ fontSize: 12 }}
                      onClick={() => { setEditingRule(rule.id); setEditValue(rule.defaultValue); }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No attendance rules configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
