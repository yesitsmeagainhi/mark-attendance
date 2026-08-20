// "use client";

// import { useEffect, useState, useCallback } from "react";
// import type { DailyEmployee, BranchRow } from "./types";
// import AddEmployeeModal from "./AddEmployeeModal";

// type DailyResponse = {
//   date: string;
//   isHoliday: boolean;
//   holidayType: string | null;
//   employees: DailyEmployee[];
//   summary: { total: number; checkedIn: number; absent: number };
// };

// function isRealPhoto(key: string) {
//   return key && key !== "admin-marked" && key !== "admin/unpaid-holiday";
// }

// export default function DashboardTab() {
//   const today = new Date().toISOString().slice(0, 10);
//   const [selectedDate, setSelectedDate] = useState(today);
//   const [data, setData] = useState<DailyResponse | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [actionInProgress, setActionInProgress] = useState<string | null>(null);
//   const [branches, setBranches] = useState<BranchRow[]>([]);
//   const [showAddModal, setShowAddModal] = useState(false);
//   const [viewPhoto, setViewPhoto] = useState<string | null>(null);

//   const fetchData = useCallback(() => {
//     fetch(`/api/admin/daily-attendance?date=${selectedDate}`)
//       .then((r) => (r.ok ? r.json() : null))
//       .then((d) => { if (d) setData(d); })
//       .catch(() => undefined)
//       .finally(() => setLoading(false));
//   }, [selectedDate]);

//   useEffect(() => {
//     fetch("/api/branches")
//       .then((r) => (r.ok ? r.json() : null))
//       .then((d) => { if (d?.branches) setBranches(d.branches); })
//       .catch(() => undefined);
//   }, []);

//   useEffect(() => {
//     setLoading(true);
//     fetchData();
//     if (selectedDate === today) {
//       const interval = setInterval(fetchData, 10000);
//       return () => clearInterval(interval);
//     }
//   }, [fetchData, selectedDate, today]);

//   async function markOne(employeeId: string, action: "present" | "absent" | "unpaid_holiday") {
//     setActionInProgress(`${employeeId}-${action}`);
//     await fetch("/api/admin/mark-attendance", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ employeeId, date: selectedDate, action }),
//     });
//     fetchData();
//     setActionInProgress(null);
//   }

//   async function undoMark(employeeId: string) {
//     setActionInProgress(`${employeeId}-undo`);
//     await fetch("/api/admin/undo-mark", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ employeeId, date: selectedDate }),
//     });
//     fetchData();
//     setActionInProgress(null);
//   }

//   async function markAll(action: "present" | "unpaid_holiday") {
//     setActionInProgress(`all-${action}`);
//     await fetch("/api/admin/mark-all", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ date: selectedDate, action }),
//     });
//     fetchData();
//     setActionInProgress(null);
//   }

//   function formatTime(ts: string) {
//     const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
//     return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
//   }

//   function statusBadge(status: string) {
//     const map: Record<string, { cls: string; label: string }> = {
//       present: { cls: "status", label: "Present" },
//       late: { cls: "status late", label: "Late" },
//       absent: { cls: "status absent", label: "Absent" },
//       unpaid_holiday: { cls: "badge-pending", label: "UH" },
//       not_marked: { cls: "badge-admin", label: "Not marked" },
//     };
//     const s = map[status] || { cls: "badge-admin", label: status };
//     return <span className={s.cls}>&#9679; {s.label}</span>;
//   }

//   const summary = data?.summary || { total: 0, checkedIn: 0, absent: 0 };

//   return (
//     <>
//       {/* Date picker + action buttons */}
//       <div className="date-picker-row">
//         <input
//           type="date"
//           value={selectedDate}
//           max={today}
//           onChange={(e) => setSelectedDate(e.target.value)}
//         />
//         <div className="bulk-actions">
//           <button
//             className="btn-action btn-present"
//             style={{ padding: "10px 18px", fontSize: 13 }}
//             disabled={!!actionInProgress}
//             onClick={() => markAll("present")}
//           >
//             Mark All Present
//           </button>
//           <button
//             className="btn-action btn-uh"
//             style={{ padding: "10px 18px", fontSize: 13 }}
//             disabled={!!actionInProgress}
//             onClick={() => markAll("unpaid_holiday")}
//           >
//             Unpaid Holiday
//           </button>
//           <button
//             className="primary add-emp-btn"
//             onClick={() => setShowAddModal(true)}
//           >
//             + Staff
//           </button>
//         </div>
//       </div>

//       {data?.isHoliday && (
//         <div className="tip" style={{ marginBottom: 18 }}>
//           <span>&#9888;</span>
//           <p><b>Unpaid Holiday</b><br />This date has been marked as an unpaid holiday for all employees.</p>
//         </div>
//       )}

//       {/* Summary cards */}
//       <section className="metrics metrics-3">
//         <article><span className="metric-icon purple">&#9673;</span><div><small>Total Staff</small><strong>{summary.total}</strong></div></article>
//         <article><span className="metric-icon green">&#10003;</span><div><small>Checked In</small><strong>{summary.checkedIn}</strong></div></article>
//         <article><span className="metric-icon red">&times;</span><div><small>Marked Absent</small><strong>{summary.absent}</strong></div></article>
//       </section>

//       {/* Daily attendance table */}
//       <section className="table-card" style={{ marginTop: 22 }}>
//         <div className="table-tools">
//           <div>
//             <h2>Daily Attendance</h2>
//             <p>{selectedDate === today ? "Live records" : selectedDate} &middot; {data?.employees.length || 0} employees</p>
//           </div>
//         </div>
//         <div className="table-wrap">
//           <table className="admin-table">
//             <thead>
//               <tr>
//                 <th>Employee</th>
//                 <th>Photo In</th>
//                 <th>Photo Out</th>
//                 <th>Punch In</th>
//                 <th>Punch Out</th>
//                 <th>Status</th>
//                 <th>Actions</th>
//               </tr>
//             </thead>
//             <tbody>
//               {loading && !data ? (
//                 <tr><td colSpan={9} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
//               ) : data?.employees.map((emp) => {
//                 const initials = emp.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
//                 const color = ["#7c3aed", "#2563eb", "#059669", "#db2777", "#ea580c"][emp.id.charCodeAt(emp.id.length - 1) % 5];
//                 const isAdminMarked = emp.source === "admin";

//                 return (
//                   <tr key={emp.id}>
//                     <td>
//                       <span className="person" style={{ background: color }}>{initials}</span>
//                       <span><b>{emp.name}</b><small>{emp.id}</small></span>
//                     </td>
//                     <td>
//                       {emp.punchIn && isRealPhoto(emp.punchIn.photoKey) ? (
//                         <img
//                           className="table-thumb"
//                           src={`/api/attendance/photo?key=${encodeURIComponent(emp.punchIn.photoKey)}`}
//                           alt="In"
//                           onClick={() => setViewPhoto(`/api/attendance/photo?key=${encodeURIComponent(emp.punchIn!.photoKey)}`)}
//                         />
//                       ) : (
//                         <span style={{ color: "#c9cbd4" }}>{"\u2014"}</span>
//                       )}
//                     </td>
//                     <td>
//                       {emp.punchOut && isRealPhoto(emp.punchOut.photoKey) ? (
//                         <img
//                           className="table-thumb"
//                           src={`/api/attendance/photo?key=${encodeURIComponent(emp.punchOut.photoKey)}`}
//                           alt="Out"
//                           onClick={() => setViewPhoto(`/api/attendance/photo?key=${encodeURIComponent(emp.punchOut!.photoKey)}`)}
//                         />
//                       ) : (
//                         <span style={{ color: "#c9cbd4" }}>{"\u2014"}</span>
//                       )}
//                     </td>
//                     <td>{emp.punchIn ? formatTime(emp.punchIn.time) : "\u2014"}</td>
//                     <td>{emp.punchOut ? formatTime(emp.punchOut.time) : "\u2014"}</td>
//                     <td>{statusBadge(emp.status)}</td>
//                     <td>
//                       <div className="review-actions" style={{ gap: 4 }}>
//                         <button className="btn-action btn-present" disabled={!!actionInProgress} onClick={() => markOne(emp.id, "present")} title="Mark Present">P</button>
//                         <button className="btn-action btn-absent" disabled={!!actionInProgress} onClick={() => markOne(emp.id, "absent")} title="Mark Absent">A</button>
//                         <button className="btn-action btn-uh" disabled={!!actionInProgress} onClick={() => markOne(emp.id, "unpaid_holiday")} title="Unpaid Holiday">UH</button>
//                         {isAdminMarked && (
//                           <button className="btn-action btn-undo" disabled={!!actionInProgress} onClick={() => undoMark(emp.id)} title="Undo">&#8617;</button>
//                         )}
//                       </div>
//                     </td>
//                   </tr>
//                 );
//               })}
//               {data && data.employees.length === 0 && (
//                 <tr><td colSpan={9} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No employees registered.</td></tr>
//               )}
//             </tbody>
//           </table>
//         </div>
//       </section>

//       {/* Photo lightbox */}
//       {viewPhoto && (
//         <div className="photo-overlay" onClick={() => setViewPhoto(null)}>
//           <img src={viewPhoto} alt="Attendance selfie" onClick={(e) => e.stopPropagation()} />
//         </div>
//       )}

//       <AddEmployeeModal
//         open={showAddModal}
//         onClose={() => setShowAddModal(false)}
//         onCreated={fetchData}
//         branches={branches}
//       />
//     </>
//   );
// }


"use client";

import { useEffect, useState, useCallback } from "react";
import type { DailyEmployee, BranchRow, DepartmentRow } from "./types";
import AddEmployeeModal from "./AddEmployeeModal";
import JournalsSection from "./JournalsSection";
import OtpRequestsSection from "./OtpRequestsSection";

type DailyResponse = {
  date: string;
  isHoliday: boolean;
  holidayType: string | null;
  employees: DailyEmployee[];
  summary: { total: number; checkedIn: number; absent: number };
};

function isRealPhoto(key: string) {
  return key && key !== "admin-marked" && key !== "admin/unpaid-holiday";
}

function getIndiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function getApiError(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error || payload?.message || "The attendance request failed.";
}

export default function DashboardTab() {
  const today = getIndiaDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [data, setData] = useState<DailyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmAction, setConfirmAction] = useState<{ label: string; detail: string; onConfirm: () => void } | null>(null);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/daily-attendance?date=${encodeURIComponent(selectedDate)}`,
        { cache: "no-store" },
      );
      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login?mode=admin";
        return;
      }
      if (!response.ok) throw new Error(await getApiError(response));
      setData(await response.json());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load daily attendance.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.branches) setBranches(d.branches); })
      .catch(() => undefined);
    fetch("/api/departments")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.departments) setDepartments(d.departments); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setData(null);
    fetchData();
    if (selectedDate === today) {
      const interval = setInterval(() => fetchData(true), 10000);
      return () => clearInterval(interval);
    }
  }, [fetchData, selectedDate, today]);

  async function runAction(key: string, url: string, body: Record<string, string>) {
    setActionInProgress(key);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login?mode=admin";
        return;
      }
      if (!response.ok) throw new Error(await getApiError(response));
      await fetchData(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update attendance.");
    } finally {
      setActionInProgress(null);
    }
  }

  function confirmMarkOne(employeeId: string, employeeName: string, action: "present" | "absent" | "unpaid_holiday") {
    const actionLabels = { present: "Present", absent: "Absent", unpaid_holiday: "Unpaid Holiday" };
    setConfirmAction({
      label: `Mark ${actionLabels[action]}`,
      detail: `Mark ${employeeName} as ${actionLabels[action]} for ${selectedDate}?`,
      onConfirm: async () => {
        setConfirmAction(null);
        await runAction(`${employeeId}-${action}`, "/api/admin/mark-attendance", {
          employeeId,
          date: selectedDate,
          action,
        });
      },
    });
  }

  function confirmUndoMark(employeeId: string, employeeName: string) {
    setConfirmAction({
      label: "Undo Mark",
      detail: `Undo attendance mark for ${employeeName} on ${selectedDate}?`,
      onConfirm: async () => {
        setConfirmAction(null);
        await runAction(`${employeeId}-undo`, "/api/admin/undo-mark", {
          employeeId,
          date: selectedDate,
        });
      },
    });
  }

  function confirmMarkAll(action: "present" | "unpaid_holiday") {
    const label = action === "present" ? "Mark All Present" : "Mark All Unpaid Holiday";
    setConfirmAction({
      label,
      detail: `${label} for all unmarked employees on ${selectedDate}?`,
      onConfirm: async () => {
        setConfirmAction(null);
        await runAction(`all-${action}`, "/api/admin/mark-all", {
          date: selectedDate,
          action,
        });
      },
    });
  }

  function formatTime(ts: string) {
    const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  }

  function formatDuration(minutes: number | null) {
    if (minutes === null) return "\u2014";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  function statusBadge(status: string) {
    const map: Record<string, { cls: string; label: string }> = {
      present: { cls: "status", label: "Present" },
      late: { cls: "status late", label: "Late" },
      absent: { cls: "status absent", label: "Absent" },
      unpaid_holiday: { cls: "badge-pending", label: "UH" },
      not_marked: { cls: "badge-admin", label: "Not marked" },
    };
    const s = map[status] || { cls: "badge-admin", label: status };
    return <span className={s.cls}>&#9679; {s.label}</span>;
  }

  const summary = data?.summary || { total: 0, checkedIn: 0, absent: 0 };

  // Detailed breakdown from employee statuses
  const allEmps = data?.employees || [];
  const onTime = allEmps.filter((e) => e.status === "present").length;
  const late = allEmps.filter((e) => e.status === "late").length;
  const absent = allEmps.filter((e) => e.status === "absent").length;
  const notMarked = allEmps.filter((e) => e.status === "not_marked").length;
  const uh = allEmps.filter((e) => e.status === "unpaid_holiday").length;
  const checkedIn = onTime + late;
  const attendancePct = summary.total > 0 ? Math.round((checkedIn / summary.total) * 100) : 0;

  const visibleEmployees = (data?.employees || []).filter((employee) => {
    const matchesSearch = `${employee.name} ${employee.id}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      {/* Date picker + action buttons */}
      <div className="date-picker-row">
        <input
          type="date"
          value={selectedDate}
          max={today}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        <div className="bulk-actions">
          <button
            className="btn-action btn-present"
            style={{ padding: "10px 18px", fontSize: 13 }}
            disabled={!!actionInProgress}
            onClick={() => confirmMarkAll("present")}
          >
            Mark All Present
          </button>
          <button
            className="btn-action btn-uh"
            style={{ padding: "10px 18px", fontSize: 13 }}
            disabled={!!actionInProgress}
            onClick={() => confirmMarkAll("unpaid_holiday")}
          >
            Unpaid Holiday
          </button>
          <button
            className="primary add-emp-btn"
            onClick={() => setShowAddModal(true)}
          >
            + Staff
          </button>
        </div>
      </div>

      {error && (
        <div className="attendance-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => fetchData()}>Try again</button>
        </div>
      )}

      {data?.isHoliday && (
        <div className="tip" style={{ marginBottom: 18 }}>
          <span>&#9888;</span>
          <p><b>Unpaid Holiday</b><br />This date has been marked as an unpaid holiday for all employees.</p>
        </div>
      )}

      {/* Attendance summary */}
      <section className="dash-summary" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, marginBottom: 20 }}>
        {/* Hero — Attendance Rate Ring */}
        <div style={{ background: "#fff", border: "1px solid #e7e9ee", borderRadius: 18, padding: "20px 28px", display: "flex", alignItems: "center", gap: 20, boxShadow: "0 5px 24px rgba(25,28,39,.04)" }}>
          <svg width={96} height={96} viewBox="0 0 96 96">
            <circle cx={48} cy={48} r={40} fill="none" stroke="#f0f1f3" strokeWidth={8} />
            <circle
              cx={48} cy={48} r={40} fill="none"
              stroke={attendancePct >= 75 ? "#6d45e5" : attendancePct >= 50 ? "#a86400" : "#c73333"}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - attendancePct / 100)}
              transform="rotate(-90 48 48)"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
            <text x={48} y={44} textAnchor="middle" fontSize={22} fontWeight={800} fill="#172033">{attendancePct}%</text>
            <text x={48} y={60} textAnchor="middle" fontSize={9} fill="#667085" fontWeight={600}>ATTENDANCE</text>
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#172033" }}>Attendance Rate</div>
            <div style={{ fontSize: 12, color: "#667085", marginTop: 2 }}>{checkedIn} of {summary.total} staff checked in</div>
            <div style={{ fontSize: 11, color: "#8990a0", marginTop: 4 }}>{selectedDate === today ? "Live \u00B7 Today" : selectedDate}</div>
          </div>
        </div>

        {/* Status breakdown cards */}
        <div className="dash-breakdown" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {[
            { label: "On Time", value: onTime, bg: "#e8f7ef", color: "#168052", icon: "\u2713", filter: "present" },
            { label: "Late", value: late, bg: "#fff4dc", color: "#a86400", icon: "\u23F0", filter: "late" },
            { label: "Absent", value: absent, bg: "#ffeded", color: "#c73333", icon: "\u2717", filter: "absent" },
            { label: "Not Marked", value: notMarked, bg: "#f3f4f8", color: "#667085", icon: "\u2014", filter: "not_marked" },
            { label: "Unpaid Hol.", value: uh, bg: "#fff4dc", color: "#a86400", icon: "UH", filter: "unpaid_holiday" },
          ].map((c) => {
            const isActive = statusFilter === c.filter;
            return (
              <div
                key={c.label}
                onClick={() => {
                  setStatusFilter(isActive ? "all" : c.filter);
                  // Scroll to the table
                  setTimeout(() => document.querySelector(".table-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
                style={{
                  background: isActive ? c.bg : "#fff",
                  border: `2px solid ${isActive ? c.color : "#e7e9ee"}`,
                  borderRadius: 14,
                  padding: "16px 12px",
                  textAlign: "center",
                  boxShadow: "0 5px 24px rgba(25,28,39,.04)",
                  cursor: "pointer",
                  transition: "all .2s ease",
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 10, background: isActive ? "#fff" : c.bg, color: c.color, display: "inline-grid", placeItems: "center", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{c.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#172033" }}>{c.value}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: c.color, textTransform: "uppercase", letterSpacing: ".04em", marginTop: 2 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: "#8990a0", marginTop: 2 }}>of {summary.total}</div>
              </div>
            );
          })}
        </div>
      </section>

      <OtpRequestsSection />

      {/* Daily attendance table */}
      <section className="table-card" style={{ marginTop: 22 }}>
        <div className="table-tools">
          <div>
            <h2>Daily Attendance</h2>
            <p>{selectedDate === today ? "Live records" : selectedDate} &middot; {data?.employees.length || 0} employees</p>
          </div>
          <div className="attendance-filters">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee or ID"
              aria-label="Search employee or ID"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by attendance status">
              <option value="all">All statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="unpaid_holiday">Unpaid holiday</option>
              <option value="not_marked">Not marked</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Photo In</th>
                <th>Photo Out</th>
                <th>Punch In</th>
                <th>Punch Out</th>
                <th>Duration</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
              ) : visibleEmployees.map((emp) => {
                const initials = emp.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                const color = ["#7c3aed", "#2563eb", "#059669", "#db2777", "#ea580c"][emp.id.charCodeAt(emp.id.length - 1) % 5];
                const isAdminMarked = emp.source === "admin";

                return (
                  <tr key={emp.id}>
                    <td data-label="Employee" className="employee-cell cell-flex">
                      <span className="person" style={{ background: color }}>{initials}</span>
                      <span><b>{emp.name}</b><small>{emp.id}</small></span>
                    </td>
                    <td data-label="Photo In">
                      {emp.punchIn && isRealPhoto(emp.punchIn.photoKey) ? (
                        <img
                          className="table-thumb"
                          src={`/api/attendance/photo?key=${encodeURIComponent(emp.punchIn.photoKey)}`}
                          alt="In"
                          role="button"
                          tabIndex={0}
                          onClick={() => setViewPhoto(`/api/attendance/photo?key=${encodeURIComponent(emp.punchIn!.photoKey)}`)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.currentTarget.click(); }}
                        />
                      ) : (
                        <span style={{ color: "#c9cbd4" }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td data-label="Photo Out">
                      {emp.punchOut && isRealPhoto(emp.punchOut.photoKey) ? (
                        <img
                          className="table-thumb"
                          src={`/api/attendance/photo?key=${encodeURIComponent(emp.punchOut.photoKey)}`}
                          alt="Out"
                          role="button"
                          tabIndex={0}
                          onClick={() => setViewPhoto(`/api/attendance/photo?key=${encodeURIComponent(emp.punchOut!.photoKey)}`)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.currentTarget.click(); }}
                        />
                      ) : (
                        <span style={{ color: "#c9cbd4" }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td data-label="Punch In">{emp.punchIn ? formatTime(emp.punchIn.time) : "\u2014"}</td>
                    <td data-label="Punch Out">{emp.punchOut ? formatTime(emp.punchOut.time) : "\u2014"}</td>
                    <td data-label="Duration" style={{ fontWeight: 600, color: emp.durationMinutes !== null ? "#6d45e5" : undefined }}>{formatDuration(emp.durationMinutes)}</td>
                    <td data-label="Location" style={{ fontSize: 12, maxWidth: 160 }}>
                      {emp.punchIn?.office ? (
                        <>
                          <div>{emp.punchIn.office}</div>
                          {emp.punchIn.latitude && emp.punchIn.longitude && (
                            <a
                              href={`https://www.google.com/maps?q=${emp.punchIn.latitude},${emp.punchIn.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 10, color: "#2563eb", textDecoration: "none" }}
                              onClick={(e) => e.stopPropagation()}
                              title={`${emp.punchIn.latitude}, ${emp.punchIn.longitude}`}
                            >
                              View on Map
                            </a>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "#c9cbd4" }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td data-label="Status">{statusBadge(emp.status)}</td>
                    <td data-label="Actions">
                      <div className="review-actions" style={{ gap: 4 }}>
                        <button className="btn-action btn-present" disabled={!!actionInProgress} onClick={() => confirmMarkOne(emp.id, emp.name, "present")} title="Mark Present">P</button>
                        <button className="btn-action btn-absent" disabled={!!actionInProgress} onClick={() => confirmMarkOne(emp.id, emp.name, "absent")} title="Mark Absent">A</button>
                        <button className="btn-action btn-uh" disabled={!!actionInProgress} onClick={() => confirmMarkOne(emp.id, emp.name, "unpaid_holiday")} title="Unpaid Holiday">UH</button>
                        {isAdminMarked && (
                          <button className="btn-action btn-undo" disabled={!!actionInProgress} onClick={() => confirmUndoMark(emp.id, emp.name)} title="Undo">&#8617;</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data && visibleEmployees.length === 0 && (
                <tr><td colSpan={9} className="attendance-empty">
                  {data.employees.length === 0 ? "No employees registered." : "No employees match these filters."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <JournalsSection />

      {/* Photo lightbox */}
      {viewPhoto && (
        <div className="photo-overlay" onClick={() => setViewPhoto(null)}>
          <img src={viewPhoto} alt="Attendance selfie" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <AddEmployeeModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={fetchData}
        branches={branches}
        departments={departments}
      />

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-card" style={{ maxWidth: 380, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>&#9888;</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{confirmAction.label}</h2>
            <p style={{ margin: "0 0 22px", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>{confirmAction.detail}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="secondary"
                style={{ flex: 1 }}
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button
                className="primary"
                style={{ flex: 1 }}
                onClick={confirmAction.onConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .attendance-error {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          margin: 14px 0; padding: 12px 14px; border: 1px solid #fecaca;
          border-radius: 12px; background: #fff1f2; color: #b91c1c; font-size: 14px;
        }
        .attendance-error button { border: 0; background: transparent; color: #b91c1c; font-weight: 700; cursor: pointer; }
        .attendance-filters { display: flex; align-items: center; gap: 10px; }
        .attendance-filters input, .attendance-filters select {
          min-height: 40px; border: 1px solid #e4e7ec; border-radius: 10px;
          background: #fff; padding: 0 12px; color: #344054;
        }
        .attendance-filters input { width: min(240px, 42vw); }
        .employee-cell { min-width: 190px; }
        .attendance-empty { text-align: center; color: #8990a0; padding: 30px !important; }
        @media (max-width: 900px) {
          .dash-summary { grid-template-columns: 1fr !important; }
          .dash-breakdown { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 760px) {
          .dash-breakdown { grid-template-columns: repeat(2, 1fr) !important; }
          .date-picker-row { align-items: stretch; flex-direction: column; }
          .bulk-actions { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
          .bulk-actions .add-emp-btn { grid-column: 1 / -1; }
          .table-tools { align-items: stretch; flex-direction: column; gap: 14px; }
          .attendance-filters { display: grid; grid-template-columns: 1fr; }
          .attendance-filters input { width: 100%; }
          .table-wrap { overflow: visible; }
          .admin-table, .admin-table tbody { display: block; width: 100%; }
          .admin-table thead { display: none; }
          .admin-table tr { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 12px; padding: 14px; border: 1px solid #eaecf0; border-radius: 14px; background: #fff; box-shadow: 0 4px 14px rgba(16, 24, 40, .05); }
          .admin-table td { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; padding: 10px 4px; border: 0; text-align: right; }
          .admin-table td::before { content: attr(data-label); color: #667085; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
          .admin-table .employee-cell, .admin-table td[data-label="Actions"] { grid-column: 1 / -1; }
          .admin-table .employee-cell { justify-content: flex-start; padding-bottom: 14px; border-bottom: 1px solid #f0f1f3; text-align: left; }
          .admin-table .employee-cell::before { display: none; }
          .admin-table td[data-label="Actions"] { justify-content: flex-end; padding-top: 14px; border-top: 1px solid #f0f1f3; }
          .review-actions { flex-wrap: wrap; justify-content: flex-end; }
          .attendance-empty { display: block !important; margin: 0 !important; }
          .attendance-empty::before { display: none; }
        }
        @media (max-width: 420px) {
          .bulk-actions { grid-template-columns: 1fr; }
          .bulk-actions .add-emp-btn { grid-column: auto; }
          .admin-table tr { grid-template-columns: 1fr; }
          .admin-table td, .admin-table .employee-cell, .admin-table td[data-label="Actions"] { grid-column: 1; }
        }
      `}</style>
    </>
  );
}