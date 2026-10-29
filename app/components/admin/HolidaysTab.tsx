"use client";

import { useEffect, useState } from "react";

type HolidayRow = { id: string; date: string; name: string; paid: boolean; note: string | null; paidEmployeeIds: string[] };
type HolidayEmployee = { id: string; name: string; paidHolidays: boolean; flexibleHours: boolean };

const emptyForm = { date: "", name: "", paid: true, paidEmployeeIds: [] as string[] };

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

export default function HolidaysTab() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [list, setList] = useState<HolidayRow[]>([]);
  const [emps, setEmps] = useState<HolidayEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HolidayRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  // Hourly (flex) employees are paid by hours worked, so holidays don't apply to them
  const salaried = emps.filter((e) => !e.flexibleHours);

  function fetchHolidays() {
    fetch(`/api/holidays?year=${year}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setList(data.holidays || []);
          setEmps(data.employees || []);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchHolidays(); }, [year]);

  function changeYear(y: string) {
    if (y === year) return;
    setLoading(true);
    setYear(y);
  }

  function defaultPaidIds(paid: boolean) {
    return paid ? salaried.filter((e) => e.paidHolidays).map((e) => e.id) : [];
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, paidEmployeeIds: defaultPaidIds(true) });
    setError("");
    setShowModal(true);
  }

  function openEdit(h: HolidayRow) {
    setEditing(h);
    setForm({ date: h.date, name: h.name, paid: h.paid, paidEmployeeIds: h.paidEmployeeIds });
    setError("");
    setShowModal(true);
  }

  function togglePaidEmployee(id: string) {
    setForm((f) => ({
      ...f,
      paidEmployeeIds: f.paidEmployeeIds.includes(id) ? f.paidEmployeeIds.filter((x) => x !== id) : [...f.paidEmployeeIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = { date: form.date, name: form.name.trim(), paid: form.paid, paidEmployeeIds: form.paidEmployeeIds };
      const res = await fetch("/api/holidays", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error || "Could not save holiday."); return; }
      setShowModal(false);
      if (form.date.slice(0, 4) !== year) changeYear(form.date.slice(0, 4));
      else fetchHolidays();
    } catch {
      setError("Could not connect to server.");
    } finally {
      setSaving(false);
    }
  }

  async function removeHoliday(h: HolidayRow) {
    if (!confirm(`Remove "${h.name}" on ${formatDate(h.date)}? Payroll will treat this as a normal working day again.`)) return;
    const res = await fetch("/api/holidays", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: h.id }) });
    if (res.ok) fetchHolidays();
    else { const d = await res.json(); alert(d.error || "Could not delete."); }
  }

  async function toggleEligibility(emp: HolidayEmployee) {
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id, paidHolidays: !emp.paidHolidays }),
    });
    fetchHolidays();
  }

  const paidCount = list.filter((h) => h.paid).length;
  const isPastDate = form.date !== "" && form.date < today;

  return (
    <>
      <section className="table-card">
        <div className="table-tools">
          <div>
            <h2>Holiday list</h2>
            <p>{year} &middot; {list.length} holidays ({paidCount} paid, {list.length - paidCount} unpaid). Changes apply to payroll and reports immediately.</p>
          </div>
          <div className="filters">
            <select value={year} onChange={(e) => changeYear(e.target.value)} aria-label="Year">
              {[-1, 0, 1].map((o) => {
                const y = String(new Date().getFullYear() + o);
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
            <button className="secondary" style={{ width: "auto", fontSize: 15, padding: "6px 14px" }} onClick={() => setShowImport(true)}>Import</button>
            <button className="primary" style={{ fontSize: 15, padding: "6px 14px" }} onClick={openAdd}>+ Add holiday</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Holiday</th><th>Type</th><th>Paid for</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
              ) : list.map((h) => {
                const paidFor = h.paidEmployeeIds.filter((id) => salaried.some((e) => e.id === id)).length;
                return (
                  <tr key={h.id}>
                    <td><b>{formatDate(h.date)}</b></td>
                    <td>{h.name}</td>
                    <td><span className={`status ${h.paid ? "" : "late"}`}>&#9679; {h.paid ? "Paid" : "Unpaid"}</span></td>
                    <td>{paidFor} / {salaried.length} employees</td>
                    <td><small>{h.date < today ? "Past" : h.date === today ? "Today" : "Upcoming"}</small></td>
                    <td>
                      <div className="review-actions">
                        <button className="btn-approve" style={{ fontSize: 14 }} onClick={() => openEdit(h)}>Edit</button>
                        <button className="btn-reject" style={{ fontSize: 14 }} onClick={() => removeHoliday(h)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && list.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No holidays added for {year}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-card" style={{ marginTop: 24 }}>
        <div className="table-tools">
          <div>
            <h2>Paid holiday eligibility</h2>
            <p>Eligible employees are paid for paid holidays by default. You can still override each holiday individually.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Pay type</th><th>Paid holidays</th></tr></thead>
            <tbody>
              {emps.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.name}</b><br /><small>{e.id}</small></td>
                  <td>{e.flexibleHours ? "Hourly (flex)" : "Monthly salary"}</td>
                  <td>
                    {e.flexibleHours ? (
                      <small style={{ color: "#8990a0" }}>Not applicable: paid by hours worked</small>
                    ) : (
                      <button className={e.paidHolidays ? "btn-approve" : "btn-reject"} style={{ fontSize: 14 }} onClick={() => toggleEligibility(e)}>
                        {e.paidHolidays ? "Eligible" : "Not eligible"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && emps.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No active employees.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? "Edit holiday" : "Add holiday"}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="modal-row">
                <label>
                  <span>Date</span>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </label>
                <label>
                  <span>Holiday name</span>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali" required minLength={2} />
                </label>
              </div>
              {isPastDate && (
                <p className="form-message success-text" style={{ margin: 0 }}>
                  This is a past date. Saving will recalculate that day&apos;s payroll: absences on this day become paid or unpaid holidays as selected below.
                </p>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
                <span style={{ flex: 1 }}>
                  Holiday type
                  <small style={{ display: "block", color: "#9ca3af", fontWeight: 400 }}>Unpaid holidays deduct one day&apos;s salary unless the employee is ticked below</small>
                </span>
                <button
                  type="button"
                  className={form.paid ? "btn-approve" : "btn-reject"}
                  style={{ fontSize: 14 }}
                  onClick={() => setForm({ ...form, paid: !form.paid, paidEmployeeIds: defaultPaidIds(!form.paid) })}
                >
                  {form.paid ? "Paid" : "Unpaid"}
                </button>
              </label>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>Paid for ({form.paidEmployeeIds.filter((id) => salaried.some((e) => e.id === id)).length} / {salaried.length})</span>
                  <span style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="secondary" style={{ fontSize: 13, padding: "2px 10px" }} onClick={() => setForm({ ...form, paidEmployeeIds: salaried.map((e) => e.id) })}>All</button>
                    <button type="button" className="secondary" style={{ fontSize: 13, padding: "2px 10px" }} onClick={() => setForm({ ...form, paidEmployeeIds: defaultPaidIds(true) })}>Eligible only</button>
                    <button type="button" className="secondary" style={{ fontSize: 13, padding: "2px 10px" }} onClick={() => setForm({ ...form, paidEmployeeIds: [] })}>None</button>
                  </span>
                </div>
                <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e7e9ee", borderRadius: 10, padding: "6px 10px" }}>
                  {salaried.map((e) => (
                    <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row", padding: "4px 0", fontWeight: 400 }}>
                      <input type="checkbox" checked={form.paidEmployeeIds.includes(e.id)} onChange={() => togglePaidEmployee(e.id)} style={{ width: "auto" }} />
                      <span style={{ flex: 1 }}>{e.name}</span>
                      {!e.paidHolidays && <small style={{ color: "#a86400" }}>Not eligible by default</small>}
                    </label>
                  ))}
                  {salaried.length === 0 && <small style={{ color: "#8990a0" }}>No salaried employees.</small>}
                </div>
              </div>
              {error && <p className="form-message">{error}</p>}
              <button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update holiday" : "Add holiday"}</button>
            </form>
          </div>
        </div>
      )}
      {showImport && <HolidayImportModal onClose={() => setShowImport(false)} onImported={fetchHolidays} />}
    </>
  );
}

/* ── Bulk Import Modal (CSV + XLSX) ────────────────────────── */

type ImportRow = { row: number; date: string; name: string; paid: boolean; paidCount: number; exceptions: string[]; action: "create" | "update" };
type ImportResponse = { rows?: ImportRow[]; errors?: { row: number; message: string }[]; salariedCount?: number; created?: number; updated?: number; error?: string };

function HolidayImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);

  async function send(f: File, dryRun: boolean, ow: boolean) {
    const formData = new FormData();
    formData.append("file", f);
    formData.append("dryRun", String(dryRun));
    formData.append("overwrite", String(ow));
    const res = await fetch("/api/holidays/bulk", { method: "POST", body: formData });
    return (await res.json()) as ImportResponse;
  }

  // Validate the file on the server without saving, so the admin sees a preview first
  async function check(f: File, ow: boolean) {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const data = await send(f, true, ow);
      if (data.error) setError(data.error);
      else setPreview(data);
    } catch {
      setError("Could not connect to server.");
    } finally {
      setBusy(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) {
      setError("Unsupported file format. Please upload a .csv or .xlsx file.");
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(f);
    check(f, overwrite);
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const data = await send(file, false, overwrite);
      if (data.error) { setError(data.error); setPreview(data); return; }
      setDone({ created: data.created || 0, updated: data.updated || 0 });
      onImported();
    } catch {
      setError("Could not connect to server.");
    } finally {
      setBusy(false);
    }
  }

  const rows = preview?.rows || [];
  const errors = preview?.errors || [];
  const canImport = !!file && rows.length > 0 && errors.length === 0 && !busy;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h2>Import holidays</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-form" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {done ? (
            <>
              <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                <b style={{ color: "#166534" }}>Import complete: {done.created} added, {done.updated} updated.</b>
                <p style={{ margin: "6px 0 0", fontSize: 15 }}>Payroll and reports already reflect these holidays.</p>
              </div>
              <button className="primary" onClick={onClose} style={{ fontSize: 16 }}>Close</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.5 }}>
                Upload a <b>.csv</b> or <b>.xlsx</b> file with one holiday per row. Columns:
                <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                  <li><b>date</b> (required): 2026-12-25 or 25/12/2026</li>
                  <li><b>name</b> (required): e.g. Diwali</li>
                  <li><b>paid</b>: Yes or No (blank = Yes)</li>
                  <li><b>notPaidFor</b>: employees who are not paid on this paid holiday</li>
                  <li><b>paidFor</b>: employees who are paid even if not eligible, or the holiday is unpaid</li>
                </ul>
                <span style={{ display: "block", marginTop: 6 }}>List employees by ID, email or name, separated by <b>;</b>. The Excel template has an Employees sheet with everyone&apos;s ID.</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="secondary" href="/api/holidays/bulk?format=xlsx" download style={{ fontSize: 15, padding: "6px 14px", textDecoration: "none" }}>Download Excel template</a>
                <a className="secondary" href="/api/holidays/bulk?format=csv" download style={{ fontSize: 15, padding: "6px 14px", textDecoration: "none" }}>Download CSV template</a>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Choose file (.csv or .xlsx)</span>
                <input type="file" accept=".csv,.xlsx" onChange={handleFile} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={overwrite}
                  style={{ width: "auto" }}
                  onChange={(e) => { setOverwrite(e.target.checked); if (file) check(file, e.target.checked); }}
                />
                <span>Update holidays that already exist (same date)</span>
              </label>

              {busy && !preview && <p style={{ margin: 0, fontSize: 15 }}>Checking file...</p>}

              {errors.length > 0 && (
                <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                  <b style={{ color: "#991b1b" }}>{errors.length} problem{errors.length !== 1 ? "s" : ""} found. Fix the file and choose it again; nothing has been imported.</b>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 15, maxHeight: 160, overflowY: "auto" }}>
                    {errors.map((err, i) => <li key={i} style={{ color: "#991b1b" }}>Row {err.row}: {err.message}</li>)}
                  </ul>
                </div>
              )}

              {rows.length > 0 && (
                <>
                  <p style={{ margin: 0, fontSize: 15 }}>
                    <b>{rows.length}</b> valid holiday{rows.length !== 1 ? "s" : ""} in <b>{file?.name}</b>
                  </p>
                  <div style={{ maxHeight: 250, overflow: "auto", border: "1px solid #e7e9ee", borderRadius: 8 }}>
                    <table style={{ fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "6px 10px" }}>Row</th>
                          <th style={{ padding: "6px 10px" }}>Date</th>
                          <th style={{ padding: "6px 10px" }}>Holiday</th>
                          <th style={{ padding: "6px 10px" }}>Type</th>
                          <th style={{ padding: "6px 10px" }}>Paid for</th>
                          <th style={{ padding: "6px 10px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.row}>
                            <td style={{ padding: "4px 10px" }}>{r.row}</td>
                            <td style={{ padding: "4px 10px", whiteSpace: "nowrap" }}>{formatDate(r.date)}</td>
                            <td style={{ padding: "4px 10px" }}>{r.name}</td>
                            <td style={{ padding: "4px 10px" }}>{r.paid ? "Paid" : "Unpaid"}</td>
                            <td style={{ padding: "4px 10px" }}>
                              {r.paidCount} / {preview?.salariedCount ?? 0}
                              {r.exceptions.length > 0 && <small style={{ display: "block", color: "#667085" }}>{r.exceptions.join(", ")}</small>}
                            </td>
                            <td style={{ padding: "4px 10px" }}>{r.action === "update" ? "Update" : "New"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {error && <p className="form-message">{error}</p>}
              <button className="primary" onClick={handleImport} disabled={!canImport} style={{ fontSize: 16 }}>
                {busy && preview ? "Importing..." : `Import ${rows.length} holiday${rows.length !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
