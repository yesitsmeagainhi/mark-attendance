"use client";

import { useEffect, useState } from "react";
import type { EmployeeRow } from "./types";

type HistoryRecord = {
  employeeId: string;
  employeeName: string;
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  durationMinutes: number | null;
  status: string;
  source: string;
  photoKeyIn: string | null;
  photoKeyOut: string | null;
};

function formatDuration(minutes: number | null) {
  if (minutes === null) return "\u2014";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatTime(ts: string) {
  const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default function HistoryTab() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(todayStr);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [employeeList, setEmployeeList] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.employees) setEmployeeList(data.employees); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    if (selectedEmployee) params.set("employee", selectedEmployee);
    fetch(`/api/admin/history?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.records) setRecords(data.records); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [fromDate, toDate, selectedEmployee]);

  return (
    <>
      <div className="date-picker-row">
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          From <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          To <input type="date" value={toDate} min={fromDate} max={todayStr} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <select
          value={selectedEmployee}
          onChange={(e) => setSelectedEmployee(e.target.value)}
          style={{ padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, background: "#fff" }}
        >
          <option value="">All employees</option>
          {employeeList.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
          ))}
        </select>
      </div>

      <section className="table-card">
        <div className="table-tools">
          <div><h2>Attendance History</h2><p>{records.length} records</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Date</th><th>Punch In</th><th>Punch Out</th><th>Duration</th><th>Status</th><th>Source</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
              ) : records.map((r) => (
                <tr key={`${r.employeeId}-${r.date}`}>
                  <td><b>{r.employeeName}</b><br /><small>{r.employeeId}</small></td>
                  <td>{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td>{r.punchIn ? formatTime(r.punchIn) : "\u2014"}</td>
                  <td>{r.punchOut ? formatTime(r.punchOut) : "\u2014"}</td>
                  <td>{formatDuration(r.durationMinutes)}</td>
                  <td>
                    {r.status === "UH" ? (
                      <span className="badge-pending">UH</span>
                    ) : (
                      <span className="status">&#9679; {r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
                    )}
                  </td>
                  <td><span className={r.source === "selfie" ? "badge-selfie" : "badge-admin"}>{r.source === "selfie" ? "Selfie" : "Admin"}</span></td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No records found for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
