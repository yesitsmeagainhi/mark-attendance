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
    assignedBranchIds: employee.assignedBranchIds || [],
    department: employee.department || "",
    monthlySalary: String(employee.monthlySalary || ""),
    hourlyRate: String((employee as { hourlyRate?: number }).hourlyRate || ""),
    flexibleHours: employee.flexibleHours ?? false,
    paidHolidays: employee.paidHolidays ?? true,
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
        assignedBranchIds: form.assignedBranchIds,
        department: form.department.trim(),
        monthlySalary: form.flexibleHours ? 0 : (parseInt(form.monthlySalary, 10) || 0),
        hourlyRate: form.flexibleHours ? (parseInt(form.hourlyRate, 10) || 0) : 0,
        flexibleHours: form.flexibleHours,
        paidHolidays: form.paidHolidays,
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
          <div style={{ background: "#f8f9fb", borderRadius: 10, padding: "10px 14px", marginBottom: 4, fontSize: 15, color: "#666" }}>
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
          <div>
            <span style={{ display: "block", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Assigned branches</span>
            <small style={{ display: "block", color: "#9ca3af", fontWeight: 400, marginBottom: 8 }}>Employee can only punch from selected branches. Leave empty for any branch.</small>
            {branches.filter((b) => b.active).length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {branches.filter((b) => b.active).map((b) => (
                  <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: form.assignedBranchIds.includes(b.id) ? "#f0ecff" : "#f8f9fb", border: `1px solid ${form.assignedBranchIds.includes(b.id) ? "#7c3aed" : "#e7e9ee"}`, transition: "all .15s" }}>
                    <input
                      type="checkbox"
                      checked={form.assignedBranchIds.includes(b.id)}
                      onChange={() => {
                        const ids = form.assignedBranchIds.includes(b.id)
                          ? form.assignedBranchIds.filter((id) => id !== b.id)
                          : [...form.assignedBranchIds, b.id];
                        setForm({ ...form, assignedBranchIds: ids });
                      }}
                      style={{ accentColor: "#7c3aed" }}
                    />
                    <span style={{ fontSize: 15, fontWeight: 600, color: form.assignedBranchIds.includes(b.id) ? "#7c3aed" : "#344054" }}>{b.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 15, color: "#9ca3af", padding: "8px 0" }}>No branches configured</div>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
            <span style={{ flex: 1 }}>
              Flexible hours
              <small style={{ display: "block", color: "#9ca3af", fontWeight: 400 }}>Lecture/session-based schedule</small>
            </span>
            <button
              type="button"
              className={form.flexibleHours ? "btn-approve" : "btn-reject"}
              style={{ fontSize: 14 }}
              onClick={() => setForm({ ...form, flexibleHours: !form.flexibleHours })}
            >
              {form.flexibleHours ? "Enabled" : "Disabled"}
            </button>
          </label>
          {!form.flexibleHours && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
              <span style={{ flex: 1 }}>
                Paid holidays
                <small style={{ display: "block", color: "#9ca3af", fontWeight: 400 }}>Salary is not deducted on paid holidays</small>
              </span>
              <button
                type="button"
                className={form.paidHolidays ? "btn-approve" : "btn-reject"}
                style={{ fontSize: 14 }}
                onClick={() => setForm({ ...form, paidHolidays: !form.paidHolidays })}
              >
                {form.paidHolidays ? "Eligible" : "Not eligible"}
              </button>
            </label>
          )}
          {form.flexibleHours ? (
            <label>
              <span>Hourly rate (&#8377;/hr)</span>
              <input type="number" inputMode="numeric" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} placeholder="e.g. 200" min="0" />
            </label>
          ) : (
            <label>
              <span>Monthly salary</span>
              <input type="number" inputMode="numeric" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} placeholder="e.g. 25000" min="0" />
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
            <span style={{ flex: 1 }}>Status</span>
            <button
              type="button"
              className={form.active ? "btn-approve" : "btn-reject"}
              style={{ fontSize: 14 }}
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
