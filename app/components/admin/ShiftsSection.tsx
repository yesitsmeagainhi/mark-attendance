"use client";

import { useEffect, useState } from "react";
import type { ShiftRow } from "./types";

type StaffRow = {
  id: string;
  name: string;
  department: string;
  workStartTime: string;
  workEndTime: string;
  shiftId: string | null;
  flexibleHours: boolean;
};

function to12h(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

function lengthLabel(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return "";
  return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
}

const emptyForm = { id: "", name: "", startTime: "09:00", endTime: "18:00" };

/** Shift templates. Assigning one copies its timings to the employee; editing it updates everyone on it. */
export default function ShiftsSection({ onAssign }: { onAssign: (shiftId: string) => void }) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/admin/shifts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setShifts(data.shifts || []);
          setStaff(data.employees || []);
        }
      })
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  async function call(method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/shifts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Something went wrong.");
        return false;
      }
      load();
      return true;
    } catch {
      setError("Could not connect to server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.endTime <= form.startTime) {
      setError("End time must be after start time.");
      return;
    }
    const body = { name: form.name.trim(), startTime: form.startTime, endTime: form.endTime };
    const editing = shifts.find((s) => s.id === form.id);
    if (editing && editing.employeeCount && (editing.startTime !== body.startTime || editing.endTime !== body.endTime)) {
      if (!confirm(`Change timings for ${editing.employeeCount} employee(s) on "${editing.name}"?`)) return;
    }
    const ok = form.id ? await call("PATCH", { id: form.id, ...body }) : await call("POST", body);
    if (ok) setForm(null);
  }

  async function remove(s: ShiftRow) {
    const msg = s.employeeCount
      ? `Delete "${s.name}"? Its ${s.employeeCount} employee(s) keep their current timings as custom hours.`
      : `Delete "${s.name}"?`;
    if (confirm(msg)) await call("DELETE", { id: s.id });
  }

  const customCount = staff.filter((e) => !e.shiftId && !e.flexibleHours).length;

  return (
    <section className="table-card">
      <div className="table-tools">
        <div>
          <h2>Shifts</h2>
          <p>Create shift timings once and assign them to staff. Late marks, half days and overtime use each employee&apos;s shift.</p>
        </div>
        {!form && (
          <button type="button" className="btn-approve" style={{ fontSize: 14 }} onClick={() => { setError(""); setForm({ ...emptyForm }); }}>
            + New shift
          </button>
        )}
      </div>

      {form && (
        <form onSubmit={saveForm} className="modal-form" style={{ padding: "0 22px 16px", borderBottom: "1px solid #f0f0f3" }}>
          <label>
            <span>Shift name</span>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning" required maxLength={40} autoFocus />
          </label>
          <div className="modal-row">
            <label>
              <span>Start</span>
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
            </label>
            <label>
              <span>End</span>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn-approve" style={{ fontSize: 14 }} disabled={busy}>{busy ? "Saving…" : form.id ? "Save shift" : "Create shift"}</button>
            <button type="button" className="btn-reject" style={{ fontSize: 14 }} onClick={() => { setForm(null); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="form-message">{error}</p>}

      <div>
        {shifts.map((s) => (
          <div key={s.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "14px 22px", borderTop: "1px solid #f0f0f3" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
              <small style={{ color: "#6b7280" }}>
                {to12h(s.startTime)} &ndash; {to12h(s.endTime)} &middot; {lengthLabel(s.startTime, s.endTime)} &middot; {s.employeeCount || 0} staff
              </small>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="btn-action btn-present" onClick={() => onAssign(s.id)}>Assign staff</button>
              <button type="button" className="btn-action btn-undo" onClick={() => { setError(""); setForm({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime }); }}>Edit</button>
              <button type="button" className="btn-action btn-absent" onClick={() => remove(s)} disabled={busy}>Delete</button>
            </div>
          </div>
        ))}
        {shifts.length === 0 && !form && (
          <p style={{ textAlign: "center", color: "#8990a0", padding: "8px 22px 24px", margin: 0 }}>
            No shifts yet. Employees use the IN/OUT timings set on their profile.
          </p>
        )}
        {shifts.length > 0 && customCount > 0 && (
          <p style={{ color: "#8990a0", fontSize: 13, padding: "10px 22px 16px", margin: 0, borderTop: "1px solid #f0f0f3" }}>
            {customCount} employee(s) have custom timings and no shift.
          </p>
        )}
      </div>

    </section>
  );
}

