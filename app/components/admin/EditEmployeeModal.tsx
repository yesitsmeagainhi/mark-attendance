"use client";

import { useState } from "react";
import type { EmployeeRow, BranchRow, DepartmentRow } from "./types";

export default function EditEmployeeModal({
  employee,
  branches,
  departments,
  onClose,
  onUpdated,
}: {
  employee: EmployeeRow;
  branches: BranchRow[];
  departments: DepartmentRow[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({
    name: employee.name,
    email: employee.email,
    password: "",
    jobRole: employee.jobRole,
    mobileNumber: employee.mobileNumber,
    workStartTime: employee.workStartTime || "09:00",
    workEndTime: employee.workEndTime || "18:00",
    office: employee.office,
    department: employee.department || "",
    monthlySalary: String(employee.monthlySalary || ""),
    flexibleHours: employee.flexibleHours ?? false,
    active: employee.active,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

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
      const payload: Record<string, unknown> = {
        id: employee.id,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        jobRole: form.jobRole.trim(),
        mobileNumber: normalizedMobile,
        workStartTime: form.workStartTime,
        workEndTime: form.workEndTime,
        office: form.office.trim(),
        department: form.department.trim(),
        monthlySalary: parseInt(form.monthlySalary, 10) || 0,
        flexibleHours: form.flexibleHours,
        active: form.active,
      };

      // Only send password if user entered a new one
      if (form.password.length > 0) {
        payload.password = form.password;
      }

      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not update employee.");
        return;
      }
      setSuccess("Employee updated successfully.");
      onUpdated();
      setTimeout(() => {
        onClose();
        setSuccess("");
      }, 1200);
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
          <h2>Edit employee</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div style={{ background: "#f8f9fb", borderRadius: 10, padding: "10px 14px", marginBottom: 4, fontSize: 13, color: "#666" }}>
            Employee ID: <b style={{ color: "#333" }}>{employee.id}</b>
          </div>
          <label>
            <span>Full name</span>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Shah" required autoFocus />
          </label>
          <label>
            <span>Job role</span>
            <input type="text" value={form.jobRole} onChange={(e) => setForm({ ...form, jobRole: e.target.value })} placeholder="e.g. Counsellor" required maxLength={80} />
          </label>
          <label>
            <span>Department</span>
            <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option value="">-- Select department --</option>
              {departments.filter((d) => d.active).map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Email address</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="priya@company.com" required />
          </label>
          <label>
            <span>New password <small style={{ color: "#9ca3af", fontWeight: 400 }}>(leave blank to keep current)</small></span>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 4 characters" minLength={4} />
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
          <label style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
            <span style={{ flex: 1 }}>
              Flexible hours
              <small style={{ display: "block", color: "#9ca3af", fontWeight: 400 }}>Exempt from late &amp; duration rules</small>
            </span>
            <button
              type="button"
              className={form.flexibleHours ? "btn-approve" : "btn-reject"}
              style={{ fontSize: 12 }}
              onClick={() => setForm({ ...form, flexibleHours: !form.flexibleHours })}
            >
              {form.flexibleHours ? "Enabled" : "Disabled"}
            </button>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
            <span style={{ flex: 1 }}>Status</span>
            <button
              type="button"
              className={form.active ? "btn-approve" : "btn-reject"}
              style={{ fontSize: 12 }}
              onClick={() => setForm({ ...form, active: !form.active })}
            >
              {form.active ? "Active" : "Inactive"}
            </button>
          </label>
          {error && <p className="form-message">{error}</p>}
          {success && <p className="form-message success-text">{success}</p>}
          <button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Update employee"}</button>
        </form>
      </div>
    </div>
  );
}
