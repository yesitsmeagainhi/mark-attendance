"use client";

import { useEffect, useState } from "react";
import { formatTimeIST, formatDuration } from "../../../lib/time-utils";

type HistoryRecord = {
  date: string;
  punchInTime: string | null;
  punchOutTime: string | null;
  duration: number | null;
  status: string;
  office: string | null;
};

type HistoryData = {
  records: HistoryRecord[];
  totalDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
};

export default function HistoryTab() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/attendance/history?days=${days}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div className="table-card" style={{ padding: 48, textAlign: "center" }}>Loading history...</div>;
  if (!data) return <div className="table-card" style={{ padding: 48, textAlign: "center" }}>Could not load history.</div>;

  const statusClass = (s: string) => {
    if (s === "On time") return "on-time";
    if (s === "Late") return "late";
    if (s === "Absent") return "absent";
    if (s === "Leave") return "grace";
    return "";
  };

  return (
    <>
      <section className="metrics">
        <article><span className="metric-icon green">&#10003;</span><div><small>Present</small><strong>{data.presentDays}</strong><em>days</em></div></article>
        <article><span className="metric-icon amber">&#9719;</span><div><small>Late</small><strong>{data.lateDays}</strong><em>days</em></div></article>
        <article><span className="metric-icon red">&times;</span><div><small>Absent</small><strong>{data.absentDays}</strong><em>days</em></div></article>
        <article><span className="metric-icon purple">&#9673;</span><div><small>Leave</small><strong>{data.leaveDays}</strong><em>days</em></div></article>
      </section>

      <section className="table-card">
        <div className="table-tools">
          <div>
            <h2>Attendance History</h2>
            <p>Last {days} days &middot; {data.totalDays} records</p>
          </div>
          <div className="filters">
            <button className={days === 30 ? "active" : ""} onClick={() => setDays(30)}>30 days</button>
            <button className={days === 60 ? "active" : ""} onClick={() => setDays(60)}>60 days</button>
            <button className={days === 90 ? "active" : ""} onClick={() => setDays(90)}>90 days</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Punch In</th>
                <th>Punch Out</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((r) => (
                <tr key={r.date}>
                  <td><b>{new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}</b></td>
                  <td>{r.punchInTime ? formatTimeIST(r.punchInTime) : "\u2014"}</td>
                  <td>{r.punchOutTime ? formatTimeIST(r.punchOutTime) : "\u2014"}</td>
                  <td>{r.duration !== null ? formatDuration(r.duration) : "\u2014"}</td>
                  <td><span className={`grace-badge ${statusClass(r.status)}`}>{r.status}</span></td>
                </tr>
              ))}
              {data.records.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No attendance records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
