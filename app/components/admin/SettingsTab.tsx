"use client";

import { useEffect, useState } from "react";
import type { BranchRow, DepartmentRow } from "./types";
import AttendanceRulesSection from "./AttendanceRulesSection";

export default function SettingsTab({ onSignOut }: { onSignOut: () => void }) {
  const [branchList, setBranchList] = useState<BranchRow[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", latitude: "", longitude: "", radius: "200" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Admin users state
  const [adminList, setAdminList] = useState<{ id: string; name: string; email: string; active: boolean; createdAt: string }[]>([]);

  // Department state
  const [deptList, setDeptList] = useState<DepartmentRow[]>([]);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: "" });
  const [deptError, setDeptError] = useState("");
  const [deptSuccess, setDeptSuccess] = useState("");
  const [deptSaving, setDeptSaving] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentRow | null>(null);

  function fetchBranches() {
    fetch("/api/branches")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.branches) setBranchList(data.branches); })
      .catch(() => undefined);
  }

  function fetchDepartments() {
    fetch("/api/departments")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.departments) setDeptList(data.departments); })
      .catch(() => undefined);
  }

  function fetchAdmins() {
    fetch("/api/employees?role=admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.employees) setAdminList(data.employees); })
      .catch(() => undefined);
  }

  useEffect(() => { fetchBranches(); fetchDepartments(); fetchAdmins(); }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setGettingLocation(false);
      },
      (err) => {
        setError(`Could not get location: ${err.message}`);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch("/api/branches", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, name: form.name.trim(), latitude: form.latitude.trim(), longitude: form.longitude.trim(), radius: parseInt(form.radius, 10) || 200 }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) { setError(data.error || "Could not update branch."); return; }
        setSuccess("Branch updated successfully.");
      } else {
        const res = await fetch("/api/branches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name.trim(), latitude: form.latitude.trim(), longitude: form.longitude.trim(), radius: parseInt(form.radius, 10) || 200 }),
        });
        const data = (await res.json()) as { error?: string; name?: string };
        if (!res.ok) { setError(data.error || "Could not create branch."); return; }
        setSuccess(`Branch "${data.name}" created successfully.`);
      }
      setForm({ name: "", latitude: "", longitude: "", radius: "200" });
      setEditing(null);
      fetchBranches();
      setTimeout(() => { setShowModal(false); setSuccess(""); }, 1500);
    } catch {
      setError("Could not connect to server.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(branch: BranchRow) {
    await fetch("/api/branches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: branch.id, active: !branch.active }),
    });
    fetchBranches();
  }

  return (
    <>
      <section className="table-card">
        <div className="table-tools">
          <div><h2>Branch locations</h2><p>{branchList.length} total</p></div>
          <div className="filters">
            <button className="primary" style={{ fontSize: 13, padding: "6px 14px" }} onClick={() => { setShowModal(true); setEditing(null); setForm({ name: "", latitude: "", longitude: "", radius: "200" }); setError(""); setSuccess(""); }}>+ Add branch</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Branch name</th><th>Latitude</th><th>Longitude</th><th>Radius</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
            <tbody>
              {branchList.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b></td>
                  <td><code>{b.latitude}</code></td>
                  <td><code>{b.longitude}</code></td>
                  <td><code>{b.radius || 200}m</code></td>
                  <td><span className={`status ${b.active ? "" : "absent"}`}>&#9679; {b.active ? "Active" : "Inactive"}</span></td>
                  <td><small>{new Date(b.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</small></td>
                  <td>
                    <div className="review-actions">
                      <button className="btn-approve" style={{ fontSize: 12 }} onClick={() => { setEditing(b); setForm({ name: b.name, latitude: b.latitude, longitude: b.longitude, radius: String(b.radius || 200) }); setShowModal(true); setError(""); setSuccess(""); }}>Edit</button>
                      <button className={b.active ? "btn-reject" : "btn-approve"} style={{ fontSize: 12 }} onClick={() => toggleActive(b)}>{b.active ? "Deactivate" : "Activate"}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {branchList.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No branches configured. Add a branch to enable geo-fenced attendance.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? "Edit branch" : "Add new branch"}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <label>
                <span>Branch name</span>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bhayandar Office" required minLength={2} autoFocus />
              </label>
              <div className="modal-row">
                <label>
                  <span>Latitude</span>
                  <input type="text" inputMode="decimal" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="e.g. 19.2952" required />
                </label>
                <label>
                  <span>Longitude</span>
                  <input type="text" inputMode="decimal" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="e.g. 72.8510" required />
                </label>
              </div>
              <label>
                <span>Geo-fence radius (meters)</span>
                <input type="number" inputMode="numeric" value={form.radius} onChange={(e) => setForm({ ...form, radius: e.target.value })} placeholder="200" min={50} required />
              </label>
              <button type="button" className="secondary" onClick={useCurrentLocation} disabled={gettingLocation} style={{ width: "100%" }}>
                {gettingLocation ? "Getting location..." : "\u{1F4CD} Use current location"}
              </button>
              {error && <p className="form-message">{error}</p>}
              {success && <p className="form-message success-text">{success}</p>}
              <button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update branch" : "Create branch"}</button>
            </form>
          </div>
        </div>
      )}

      {/* Departments section */}
      <section className="table-card" style={{ marginTop: 24 }}>
        <div className="table-tools">
          <div><h2>Departments</h2><p>{deptList.length} total</p></div>
          <div className="filters">
            <button className="primary" style={{ fontSize: 13, padding: "6px 14px" }} onClick={() => { setShowDeptModal(true); setEditingDept(null); setDeptForm({ name: "" }); setDeptError(""); setDeptSuccess(""); }}>+ Add department</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Department name</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
            <tbody>
              {deptList.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.name}</b></td>
                  <td><span className={`status ${d.active ? "" : "absent"}`}>&#9679; {d.active ? "Active" : "Inactive"}</span></td>
                  <td><small>{new Date(d.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</small></td>
                  <td>
                    <div className="review-actions">
                      <button className="btn-approve" style={{ fontSize: 12 }} onClick={() => { setEditingDept(d); setDeptForm({ name: d.name }); setShowDeptModal(true); setDeptError(""); setDeptSuccess(""); }}>Edit</button>
                      <button className={d.active ? "btn-reject" : "btn-approve"} style={{ fontSize: 12 }} onClick={async () => {
                        await fetch("/api/departments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, active: !d.active }) });
                        fetchDepartments();
                      }}>{d.active ? "Deactivate" : "Activate"}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {deptList.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No departments configured yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showDeptModal && (
        <div className="modal-overlay" onClick={() => setShowDeptModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingDept ? "Edit department" : "Add new department"}</h2>
              <button className="modal-close" onClick={() => setShowDeptModal(false)}>&times;</button>
            </div>
            <form className="modal-form" onSubmit={async (e) => {
              e.preventDefault();
              setDeptError("");
              setDeptSuccess("");
              setDeptSaving(true);
              try {
                if (editingDept) {
                  const res = await fetch("/api/departments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingDept.id, name: deptForm.name.trim() }) });
                  const data = (await res.json()) as { error?: string };
                  if (!res.ok) { setDeptError(data.error || "Could not update department."); return; }
                  setDeptSuccess("Department updated successfully.");
                } else {
                  const res = await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: deptForm.name.trim() }) });
                  const data = (await res.json()) as { error?: string; name?: string };
                  if (!res.ok) { setDeptError(data.error || "Could not create department."); return; }
                  setDeptSuccess(`Department "${data.name}" created successfully.`);
                }
                setDeptForm({ name: "" });
                setEditingDept(null);
                fetchDepartments();
                setTimeout(() => { setShowDeptModal(false); setDeptSuccess(""); }, 1500);
              } catch {
                setDeptError("Could not connect to server.");
              } finally {
                setDeptSaving(false);
              }
            }}>
              <label>
                <span>Department name</span>
                <input type="text" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="e.g. Human Resources" required minLength={2} autoFocus />
              </label>
              {deptError && <p className="form-message">{deptError}</p>}
              {deptSuccess && <p className="form-message success-text">{deptSuccess}</p>}
              <button className="primary" type="submit" disabled={deptSaving}>{deptSaving ? "Saving..." : editingDept ? "Update department" : "Create department"}</button>
            </form>
          </div>
        </div>
      )}

      <AttendanceRulesSection />

      {/* Admin Users section */}
      <section className="table-card" style={{ marginTop: 24 }}>
        <div className="table-tools">
          <div><h2>Admin Users</h2><p>{adminList.length} total</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Added</th></tr></thead>
            <tbody>
              {adminList.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.name}</b></td>
                  <td>{a.email}</td>
                  <td><span className={`status ${a.active ? "" : "absent"}`}>&#9679; {a.active ? "Active" : "Inactive"}</span></td>
                  <td><small>{new Date(a.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</small></td>
                </tr>
              ))}
              {adminList.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No admin users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-card" style={{ marginTop: 24, textAlign: "center", padding: 24 }}>
        <button className="signout" onClick={onSignOut} style={{ width: "100%" }}>Sign out</button>
      </section>
    </>
  );
}
