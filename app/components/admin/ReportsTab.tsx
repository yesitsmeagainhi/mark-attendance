"use client";

import { useEffect, useState } from "react";

type ReportRow = {
  id: string;
  name: string;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  uhDays: number;
  attendancePct: number;
};

export default function ReportsTab() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [workingDays, setWorkingDays] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/reports?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setRows(data.employees || []);
          setWorkingDays(data.workingDays || 0);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [month]);

  const totals = rows.reduce(
    (acc, r) => ({
      present: acc.present + r.presentDays,
      absent: acc.absent + r.absentDays,
      late: acc.late + r.lateDays,
      leave: acc.leave + r.leaveDays,
      uh: acc.uh + r.uhDays,
    }),
    { present: 0, absent: 0, late: 0, leave: 0, uh: 0 },
  );
  const avgPct = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.attendancePct, 0) / rows.length) : 0;

  return (
    <>
      <div className="date-picker-row">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <span style={{ fontSize: 13, color: "#667085" }}>Working days: <b>{workingDays}</b></span>
      </div>

      <section className="table-card">
        <div className="table-tools">
          <div><h2>Attendance Report</h2><p>{month} &middot; {rows.length} employees</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>UH</th><th>Attendance %</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b><br /><small>{r.id}</small></td>
                  <td><span className="grace-badge on-time">{r.presentDays}</span></td>
                  <td><span className="grace-badge late">{r.absentDays}</span></td>
                  <td><span className="grace-badge grace">{r.lateDays}</span></td>
                  <td>{r.leaveDays}</td>
                  <td>{r.uhDays}</td>
                  <td><b>{r.attendancePct}%</b></td>
                </tr>
              ))}
              {!loading && rows.length > 0 && (
                <tr className="totals-row">
                  <td><b>TOTALS</b></td>
                  <td><b>{totals.present}</b></td>
                  <td><b>{totals.absent}</b></td>
                  <td><b>{totals.late}</b></td>
                  <td><b>{totals.leave}</b></td>
                  <td><b>{totals.uh}</b></td>
                  <td><b>{avgPct}%</b></td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No data for this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
