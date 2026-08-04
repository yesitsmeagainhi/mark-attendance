"use client";

import { useEffect, useRef, useState } from "react";

type AdminRow = { initials: string; name: string; id: string; time: string; status: string; color: string; photoKey?: string };
type EmployeeRow = { id: string; name: string; email: string; role: string; office: string; active: boolean; createdAt: string };

const rows: AdminRow[] = [
  { initials: "AM", name: "Aarav Mehta", id: "EMP-1024", time: "09:02 AM", status: "On time", color: "#7c3aed" },
  { initials: "PS", name: "Priya Shah", id: "EMP-1031", time: "09:18 AM", status: "Late", color: "#db2777" },
];

function Brand() {
  return <div className="brand"><span className="brandmark">A</span><span>Attendly</span></div>;
}

export default function DashboardClient({ view, employeeId, displayName, role }: { view: "employee" | "admin"; employeeId: string; displayName: string; role: "employee" | "admin" }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [punched, setPunched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [adminRows, setAdminRows] = useState<AdminRow[]>(rows);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Employee management state (admin only)
  const [employeeList, setEmployeeList] = useState<EmployeeRow[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role: "employee", office: "Airoli Office" });
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    if (!cameraOpen) return;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraOpen(false));
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [cameraOpen]);

  useEffect(() => {
    if (view !== "admin") return;
    fetch("/api/attendance").then((response) => response.ok ? response.json() : null).then((data) => {
      const records = data?.records as Array<{ employeeId: string; name: string; serverTimestamp: string; office: string; photoKey: string }> | undefined;
      if (!records?.length) return;
      setAdminRows(records.map((record, index) => {
        const date = new Date(record.serverTimestamp.replace(" ", "T") + "Z");
        const initials = record.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
        const late = date.getUTCHours() > 3 || (date.getUTCHours() === 3 && date.getUTCMinutes() > 45);
        return { initials, name: record.name, id: record.employeeId, time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }), status: late ? "Late" : "On time", color: ["#7c3aed", "#db2777", "#2563eb", "#059669"][index % 4], photoKey: record.photoKey };
      }));
    }).catch(() => undefined);
    fetchEmployees();
  }, [view]);

  function fetchEmployees() {
    fetch("/api/employees")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.employees) setEmployeeList(data.employees);
      })
      .catch(() => undefined);
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", .82));
    setCameraOpen(false);
  }

  async function submitPunch() {
    if (!photo) return setCameraOpen(true);
    setSaving(true);
    setMessage("");
    try {
      const blob = await (await fetch(photo)).blob();
      const form = new FormData();
      form.append("photo", blob, "selfie.jpg");
      form.append("employeeId", employeeId);
      form.append("punchType", "IN");
      form.append("office", "Airoli Office");
      const response = await fetch("/api/attendance", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not mark attendance.");
      setPunched(true);
      setMessage("Attendance saved with a secure server timestamp.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark attendance.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddSuccess("");
    setAddSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json() as { error?: string; id?: string; name?: string };
      if (!res.ok) {
        setAddError(data.error || "Could not create employee.");
        return;
      }
      setAddSuccess(`${data.name} (${data.id}) created successfully.`);
      setAddForm({ name: "", email: "", password: "", role: "employee", office: "Airoli Office" });
      fetchEmployees();
      setTimeout(() => { setShowAddModal(false); setAddSuccess(""); }, 1500);
    } catch {
      setAddError("Could not connect to server.");
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <Brand />
        <nav><span className="portal-label">{view === "admin" ? "Admin portal" : "Employee portal"}</span></nav>
        <div className="user"><span className="avatar">{displayName.slice(0,2).toUpperCase()}</span><span><b>{displayName}</b><small>{role === "admin" ? "Administrator" : employeeId}</small></span><button className="signout" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }}>Sign out</button></div>
      </header>

      {view === "employee" ? (
        <div className="employee-layout">
          <section className="welcome">
            <div>
              <p className="eyebrow">Tuesday, 4 August</p>
              <h1>Good morning, {displayName.split(/\s+/)[0]}</h1>
              <p>Ready to start your workday? Take a clear selfie to mark your attendance.</p>
            </div>
            <div className="time-card"><small>Current time</small><strong>09:04</strong><span>AM · IST</span></div>
          </section>

          <section className="punch-grid">
            <article className="camera-card">
              <div className="card-heading"><div><span className="step">1</span><b>Take your selfie</b></div><span className="secure">● Secure capture</span></div>
              <div className={`camera-frame ${photo ? "has-photo" : ""}`}>
                {cameraOpen ? <video ref={videoRef} autoPlay muted playsInline /> : photo ? <img src={photo} alt="Captured attendance selfie" /> : <div className="camera-empty"><span className="camera-icon">◎</span><b>Camera preview</b><p>Your selfie will be used only for attendance verification.</p></div>}
                <span className="corner tl"/><span className="corner tr"/><span className="corner bl"/><span className="corner br"/>
              </div>
              {cameraOpen ? <button className="primary" onClick={capture}>Capture selfie</button> : <button className="secondary" onClick={() => { setPhoto(null); setCameraOpen(true); }}>{photo ? "Retake selfie" : "Open camera"}</button>}
              <p className="privacy">🔒 Your photo is encrypted and visible only to authorized administrators.</p>
            </article>

            <aside className="punch-card">
              <div className="card-heading"><div><span className="step">2</span><b>Confirm attendance</b></div></div>
              <div className="status-row"><span className="status-icon">↘</span><div><small>Punch in</small><b>{punched ? "Recorded just now" : "Not recorded yet"}</b></div><span className={punched ? "badge success" : "badge"}>{punched ? "Present" : "Pending"}</span></div>
              <dl>
                <div><dt>Date</dt><dd>04 Aug 2026</dd></div>
                <div><dt>Work location</dt><dd>📍 Airoli Office</dd></div>
                <div><dt>Shift</dt><dd>09:00 AM – 06:00 PM</dd></div>
              </dl>
              <button className="primary punch" onClick={submitPunch} disabled={punched || saving}>{punched ? "Attendance marked ✓" : saving ? "Saving securely…" : "Punch in with selfie"}</button>
              {message && <p className={punched ? "form-message success-text" : "form-message"}>{message}</p>}
              <p className="server-note">Timestamp is generated securely by the server</p>
              <div className="tip"><span>☀</span><p><b>Quick tip</b><br/>Face the light and keep your full face inside the frame.</p></div>
            </aside>
          </section>

          <section className="week"><div><p className="eyebrow">This week</p><h2>Your attendance</h2></div><div className="week-days">{["M","T","W","T","F"].map((d,i)=><span key={i} className={i<2?"done":i===2?"today":""}>{i<2?"✓":d}<small>{i+2}</small></span>)}</div><div className="week-score"><strong>2/5</strong><span>days completed</span></div></section>
        </div>
      ) : (
        <div className="admin-layout">
          <section className="admin-title">
            <div><p className="eyebrow">Workforce overview</p><h1>Attendance dashboard</h1><p>Monitor today's attendance and verify employee selfies.</p></div>
            <div className="title-actions">
              <button className="primary add-emp-btn" onClick={() => { setShowAddModal(true); setAddError(""); setAddSuccess(""); }}>+ Add employee</button>
              <button className="export">⇩ Export report</button>
            </div>
          </section>
          <section className="metrics">
            <article><span className="metric-icon purple">◉</span><div><small>Total employees</small><strong>{employeeList.length || "—"}</strong><em>All active employees</em></div></article>
            <article><span className="metric-icon green">✓</span><div><small>Present today</small><strong>{adminRows.length}</strong><em>{employeeList.length ? `${Math.round((adminRows.length / employeeList.length) * 100)}%` : "—"} attendance</em></div></article>
            <article><span className="metric-icon amber">◷</span><div><small>Late arrivals</small><strong>{adminRows.filter(r => r.status === "Late").length}</strong><em>After 09:15 AM</em></div></article>
            <article><span className="metric-icon red">×</span><div><small>Absent</small><strong>{Math.max(0, employeeList.length - adminRows.length)}</strong><em>{employeeList.length ? `${Math.round((Math.max(0, employeeList.length - adminRows.length) / employeeList.length) * 100)}%` : "—"} of workforce</em></div></article>
          </section>
          <section className="table-card">
            <div className="table-tools"><div><h2>Today's attendance</h2><p>Live records · Last updated just now</p></div><div className="filters"><label>⌕ <input placeholder="Search employee" /></label><button>All statuses⌄</button><button>Today⌄</button></div></div>
            <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Punch in</th><th>Location</th><th>Selfie</th><th>Status</th><th></th></tr></thead><tbody>{adminRows.map((r)=><tr key={`${r.id}-${r.time}`}><td><span className="person" style={{background:r.color}}>{r.initials}</span><span><b>{r.name}</b><small>{r.id}</small></span></td><td><b>{r.time}</b><small>{r.time!=="—"?"04 Aug 2026":"No record"}</small></td><td>Airoli Office</td><td>{r.status!=="Absent"?<button className="selfie" onClick={() => r.photoKey && window.open(`/api/attendance/photo?key=${encodeURIComponent(r.photoKey)}`, "_blank", "noopener,noreferrer")}>◉ View photo</button>:"—"}</td><td><span className={`status ${r.status.toLowerCase().replace(" ","-")}`}>● {r.status}</span></td><td>•••</td></tr>)}</tbody></table></div>
            <div className="pagination"><span>Showing 1–{Math.min(5, adminRows.length)} of {adminRows.length} records</span></div>
          </section>

          <section className="table-card" style={{marginTop: 22}}>
            <div className="table-tools"><div><h2>Registered employees</h2><p>{employeeList.length} total</p></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Email</th><th>Role</th><th>Office</th><th>Status</th><th>Added</th></tr></thead>
                <tbody>
                  {employeeList.map((emp) => {
                    const initials = emp.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                    const color = ["#7c3aed", "#2563eb", "#059669", "#db2777", "#ea580c"][emp.id.charCodeAt(emp.id.length - 1) % 5];
                    return (
                      <tr key={emp.id}>
                        <td><span className="person" style={{background: color}}>{initials}</span><span><b>{emp.name}</b><small>{emp.id}</small></span></td>
                        <td>{emp.email}</td>
                        <td><span className={`status ${emp.role === "admin" ? "late" : ""}`}>● {emp.role === "admin" ? "Admin" : "Employee"}</span></td>
                        <td>{emp.office}</td>
                        <td><span className={`status ${emp.active ? "" : "absent"}`}>● {emp.active ? "Active" : "Inactive"}</span></td>
                        <td><small>{new Date(emp.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</small></td>
                      </tr>
                    );
                  })}
                  {employeeList.length === 0 && <tr><td colSpan={6} style={{textAlign: "center", color: "#8990a0", padding: 30}}>No employees registered yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {showAddModal && (
            <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Add new employee</h2>
                  <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
                </div>
                <form className="modal-form" onSubmit={handleAddEmployee}>
                  <label>
                    <span>Full name</span>
                    <input type="text" value={addForm.name} onChange={(e) => setAddForm({...addForm, name: e.target.value})} placeholder="e.g. Priya Shah" required autoFocus />
                  </label>
                  <label>
                    <span>Email address</span>
                    <input type="email" value={addForm.email} onChange={(e) => setAddForm({...addForm, email: e.target.value})} placeholder="priya@company.com" required />
                  </label>
                  <label>
                    <span>Password</span>
                    <input type="password" value={addForm.password} onChange={(e) => setAddForm({...addForm, password: e.target.value})} placeholder="Min 4 characters" required minLength={4} />
                  </label>
                  <div className="modal-row">
                    <label>
                      <span>Role</span>
                      <select value={addForm.role} onChange={(e) => setAddForm({...addForm, role: e.target.value})}>
                        <option value="employee">Employee</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <label>
                      <span>Office</span>
                      <input type="text" value={addForm.office} onChange={(e) => setAddForm({...addForm, office: e.target.value})} placeholder="Airoli Office" />
                    </label>
                  </div>
                  {addError && <p className="form-message">{addError}</p>}
                  {addSuccess && <p className="form-message success-text">{addSuccess}</p>}
                  <button className="primary" type="submit" disabled={addSaving}>{addSaving ? "Creating..." : "Create employee"}</button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
      <footer><span>© 2026 Attendly</span><span>Privacy · Support · System status <i>● Operational</i></span></footer>
    </main>
  );
}
