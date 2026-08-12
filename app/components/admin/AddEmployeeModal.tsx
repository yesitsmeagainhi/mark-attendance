"use client";

import { useEffect, useState } from "react";
import type { BranchRow } from "./types";

type RuleDefault = {
  id: string;
  label: string;
  valueType: "number" | "boolean";
  defaultValue: string;
};

const emptyForm = {
  name: "",
  jobRole: "",
  email: "",
  password: "",
  mobileNumber: "",
  workStartTime: "09:00",
  workEndTime: "18:00",
  office: "",
  monthlySalary: "",
  role: "employee" as const,
};

export default function AddEmployeeModal({
  open,
  onClose,
  onCreated,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  branches: BranchRow[];
}) {
  const [form, setForm] = useState({ ...emptyForm, office: branches.find((b) => b.active)?.name || "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [ruleDefaults, setRuleDefaults] = useState<RuleDefault[]>([]);
  const [ruleOverrides, setRuleOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      fetch("/api/admin/rules")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data?.rules) setRuleDefaults(data.rules); })
        .catch(() => undefined);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const normalizedMobile = form.mobileNumber.replace(/\D/g, "");
    if (normalizedMobile.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (form.workStartTime >= form.workEndTime) {
      setError("OUT timing must be later than IN timing.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          jobRole: form.jobRole.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          mobileNumber: normalizedMobile,
          workStartTime: form.workStartTime,
          workEndTime: form.workEndTime,
          office: form.office.trim(),
          role: form.role,
          monthlySalary: parseInt(form.monthlySalary, 10) || 0,
          ruleOverrides: Object.entries(ruleOverrides)
            .filter(([, v]) => v !== "")
            .map(([ruleId, value]) => ({ ruleId, value })),
        }),
      });
      const data = (await res.json()) as { error?: string; id?: string; name?: string };
      if (!res.ok) {
        setError(data.error || "Could not create employee.");
        return;
      }
      setSuccess(`${data.name} (${data.id}) created successfully.`);
      setForm({ ...emptyForm, office: branches.find((b) => b.active)?.name || "" });
      setRuleOverrides({});
      setShowRules(false);
      onCreated();
      setTimeout(() => {
        onClose();
        setSuccess("");
      }, 1500);
    } catch {
      setError("Could not connect to server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add new employee</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            <span>Full name</span>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Shah" required autoFocus />
          </label>
          <label>
            <span>Job role</span>
            <input type="text" value={form.jobRole} onChange={(e) => setForm({ ...form, jobRole: e.target.value })} placeholder="e.g. Counsellor" required maxLength={80} />
          </label>
          <label>
            <span>Email address</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="priya@company.com" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 4 characters" required minLength={4} />
          </label>
          <label>
            <span>Mobile number</span>
            <input type="tel" inputMode="numeric" value={form.mobileNumber} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile number" pattern="[0-9]{10}" required />
          </label>
          <div className="modal-row">
            <label>
              <span>IN timing</span>
              <input type="time" value={form.workStartTime} onChange={(e) => setForm({ ...form, workStartTime: e.target.value })} required />
            </label>
            <label>
              <span>OUT timing</span>
              <input type="time" value={form.workEndTime} onChange={(e) => setForm({ ...form, workEndTime: e.target.value })} required />
            </label>
          </div>
          <label>
            <span>Office location</span>
            <select value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })}>
              {branches.filter((b) => b.active).length > 0 ? (
                branches.filter((b) => b.active).map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))
              ) : (
                <option value="">No branches configured</option>
              )}
            </select>
          </label>
          <label>
            <span>Monthly salary</span>
            <input type="number" inputMode="numeric" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} placeholder="e.g. 25000" min="0" />
          </label>
          <div style={{ borderTop: "1px solid #f0f0f3", paddingTop: 12 }}>
            <button type="button" className="secondary" style={{ width: "100%", fontSize: 13 }} onClick={() => setShowRules(!showRules)}>
              {showRules ? "\u25B2 Hide attendance rules" : "\u25BC Attendance rules (optional)"}
            </button>
            {showRules && ruleDefaults.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {ruleDefaults.map((rule) => (
                  <div key={rule.id} style={{ marginBottom: 10 }}>
                    <small style={{ fontWeight: 600 }}>{rule.label}</small>
                    <small style={{ color: "#9ca3af", marginLeft: 8 }}>Default: {rule.valueType === "boolean" ? (rule.defaultValue === "true" ? "Enabled" : "Disabled") : rule.defaultValue}</small>
                    {rule.valueType === "boolean" ? (
                      <div style={{ marginTop: 4 }}>
                        <button
                          type="button"
                          className={(ruleOverrides[rule.id] || rule.defaultValue) === "true" ? "btn-approve" : "btn-reject"}
                          style={{ fontSize: 12 }}
                          onClick={() => {
                            const current = ruleOverrides[rule.id] || rule.defaultValue;
                            setRuleOverrides({ ...ruleOverrides, [rule.id]: current === "true" ? "false" : "true" });
                          }}
                        >
                          {(ruleOverrides[rule.id] || rule.defaultValue) === "true" ? "Enabled" : "Disabled"}
                        </button>
                      </div>
                    ) : (
                      <input
                        type="number"
                        className="salary-input"
                        style={{ marginTop: 4, width: 80 }}
                        placeholder={rule.defaultValue}
                        value={ruleOverrides[rule.id] ?? ""}
                        onChange={(e) => setRuleOverrides({ ...ruleOverrides, [rule.id]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <p className="form-message">{error}</p>}
          {success && <p className="form-message success-text">{success}</p>}
          <button className="primary" type="submit" disabled={saving}>{saving ? "Creating..." : "Create employee"}</button>
        </form>
      </div>
    </div>
  );
}
