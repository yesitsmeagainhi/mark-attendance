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
//                 <tr><td colSpan={8} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
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
//                 <tr><td colSpan={8} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No employees registered.</td></tr>
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
import type { DailyEmployee, BranchRow } from "./types";
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  async function markOne(employeeId: string, action: "present" | "absent" | "unpaid_holiday") {
    await runAction(`${employeeId}-${action}`, "/api/admin/mark-attendance", {
      employeeId,
      date: selectedDate,
      action,
    });
  }

  async function undoMark(employeeId: string) {
    await runAction(`${employeeId}-undo`, "/api/admin/undo-mark", {
      employeeId,
      date: selectedDate,
    });
  }

  async function markAll(action: "present" | "unpaid_holiday") {
    await runAction(`all-${action}`, "/api/admin/mark-all", {
      date: selectedDate,
      action,
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
            onClick={() => markAll("present")}
          >
            Mark All Present
          </button>
          <button
            className="btn-action btn-uh"
            style={{ padding: "10px 18px", fontSize: 13 }}
            disabled={!!actionInProgress}
            onClick={() => markAll("unpaid_holiday")}
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

      {/* Summary cards */}
      <section className="metrics metrics-3">
        <article><span className="metric-icon purple">&#9673;</span><div><small>Total Staff</small><strong>{summary.total}</strong></div></article>
        <article><span className="metric-icon green">&#10003;</span><div><small>Checked In</small><strong>{summary.checkedIn}</strong></div></article>
        <article><span className="metric-icon red">&times;</span><div><small>Marked Absent</small><strong>{summary.absent}</strong></div></article>
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
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
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
                    <td data-label="Status">{statusBadge(emp.status)}</td>
                    <td data-label="Actions">
                      <div className="review-actions" style={{ gap: 4 }}>
                        <button className="btn-action btn-present" disabled={!!actionInProgress} onClick={() => markOne(emp.id, "present")} title="Mark Present">P</button>
                        <button className="btn-action btn-absent" disabled={!!actionInProgress} onClick={() => markOne(emp.id, "absent")} title="Mark Absent">A</button>
                        <button className="btn-action btn-uh" disabled={!!actionInProgress} onClick={() => markOne(emp.id, "unpaid_holiday")} title="Unpaid Holiday">UH</button>
                        {isAdminMarked && (
                          <button className="btn-action btn-undo" disabled={!!actionInProgress} onClick={() => undoMark(emp.id)} title="Undo">&#8617;</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data && visibleEmployees.length === 0 && (
                <tr><td colSpan={8} className="attendance-empty">
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
      />

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
        @media (max-width: 760px) {
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