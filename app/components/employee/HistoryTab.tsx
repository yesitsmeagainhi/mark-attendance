"use client";

import { useEffect, useState } from "react";
import { formatTimeIST, formatDuration } from "../../../lib/time-utils";

function isRealPhoto(key: string | null) {
  return key && key !== "admin-marked" && key !== "admin/unpaid-holiday";
}

type HistoryRecord = {
  date: string;
  punchInTime: string | null;
  punchOutTime: string | null;
  duration: number | null;
  status: string;
  lateByMinutes: number | null;
  office: string | null;
  photoKeyIn: string | null;
  photoKeyOut: string | null;
};

type HistoryData = {
  records: HistoryRecord[];
  totalDays: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  uhDays: number;
  absentDays: number;
  leaveDays: number;
  sundayWorkedDays: number;
};

type DayData = {
  date: string;
  dayOfWeek: number;
  status: string;
  punchIn: string | null;
  punchOut: string | null;
  duration: number | null;
};

type TimesheetData = {
  month: string;
  days: DayData[];
  totalHoursWorked: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  uhDays: number;
  sundayWorkedDays: number;
};

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function HistoryTab() {
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Shared month state for both views
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // List view state
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  // Grid view state
  const [tsData, setTsData] = useState<TimesheetData | null>(null);
  const [tsLoading, setTsLoading] = useState(false);

  // Fetch list data by month
  useEffect(() => {
    if (viewMode !== "list") return;
    setLoading(true);
    fetch(`/api/attendance/history?month=${monthStr}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [monthStr, viewMode]);

  // Fetch grid data
  useEffect(() => {
    if (viewMode !== "grid") return;
    setTsLoading(true);
    fetch(`/api/attendance/timesheet?month=${monthStr}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTsData(d); })
      .catch(() => undefined)
      .finally(() => setTsLoading(false));
  }, [monthStr, viewMode]);

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  }

  function nextMonth() {
    if (isCurrentMonth) return;
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  }

  const statusClass = (s: string) => {
    if (s === "On time") return "on-time";
    if (s === "Late") return "late";
    if (s === "Absent" || s === "Short Day") return "absent";
    if (s === "Half Day") return "late";
    if (s === "Leave" || s === "UH") return "grace";
    if (s === "Extra Pay") return "on-time";
    if (s === "Sunday") return "grace";
    return "";
  };

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const calendarCells: Array<DayData | null> = [];
  for (let i = 0; i < startOffset; i++) calendarCells.push(null);
  if (tsData) {
    for (const day of tsData.days) calendarCells.push(day);
  } else {
    for (let d = 1; d <= daysInMonth; d++) {
      calendarCells.push({ date: `${monthStr}-${String(d).padStart(2, "0")}`, dayOfWeek: 0, status: "future", punchIn: null, punchOut: null, duration: null });
    }
  }
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  // View toggle buttons
  const toggleBar = (
    <div style={{ display: "flex", gap: 4, background: "#f3f4f8", borderRadius: 10, padding: 3, marginBottom: 18 }}>
      <button
        onClick={() => setViewMode("list")}
        style={{
          flex: 1, border: 0, borderRadius: 8, padding: "8px 14px",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
          background: viewMode === "list" ? "#fff" : "transparent",
          color: viewMode === "list" ? "var(--purple)" : "var(--muted)",
          boxShadow: viewMode === "list" ? "0 1px 4px rgba(0,0,0,.08)" : "none",
        }}
      >
        List View
      </button>
      <button
        onClick={() => setViewMode("grid")}
        style={{
          flex: 1, border: 0, borderRadius: 8, padding: "8px 14px",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
          background: viewMode === "grid" ? "#fff" : "transparent",
          color: viewMode === "grid" ? "var(--purple)" : "var(--muted)",
          boxShadow: viewMode === "grid" ? "0 1px 4px rgba(0,0,0,.08)" : "none",
        }}
      >
        Calendar View
      </button>
    </div>
  );

  // Month navigation bar (shared by both views)
  const monthNav = (
    <div className="month-nav">
      <button onClick={prevMonth}>&larr;</button>
      <span>{monthNames[month - 1]} {year}</span>
      <button onClick={nextMonth} disabled={isCurrentMonth}>&rarr;</button>
    </div>
  );

  // ── Grid View ──
  if (viewMode === "grid") {
    return (
      <>
        {toggleBar}

        <div className="timesheet-header">
          <h3>Monthly Attendance</h3>
          {monthNav}
        </div>

        {tsLoading && !tsData ? (
          <div className="table-card" style={{ padding: 48, textAlign: "center" }}>Loading calendar...</div>
        ) : (
          <div style={{ opacity: tsLoading ? 0.45 : 1, pointerEvents: tsLoading ? "none" : "auto", transition: "opacity .2s ease" }}>
            <div className="calendar-grid">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="calendar-header">{d}</div>
              ))}
              {calendarCells.map((cell, i) => {
                if (!cell) return <div key={`empty-${i}`} className="calendar-day empty"></div>;
                const dayNum = parseInt(cell.date.slice(-2), 10);
                return (
                  <div key={cell.date} className={`calendar-day ${cell.status}`}>
                    <div className="day-num">{dayNum}</div>
                    {cell.status === "present" && cell.punchIn && (
                      <div className="day-times">
                        {formatTimeIST(cell.punchIn)}
                        {cell.punchOut ? ` - ${formatTimeIST(cell.punchOut)}` : ""}
                      </div>
                    )}
                    {cell.status === "half" && cell.punchIn && (
                      <div className="day-times">
                        {formatTimeIST(cell.punchIn)}
                        {cell.punchOut ? ` - ${formatTimeIST(cell.punchOut)}` : ""}
                      </div>
                    )}
                    {cell.status === "short" && cell.punchIn && (
                      <div className="day-times">
                        {formatTimeIST(cell.punchIn)}
                        {cell.punchOut ? ` - ${formatTimeIST(cell.punchOut)}` : ""}
                      </div>
                    )}
                    {cell.status === "extra-pay" && cell.punchIn && (
                      <div className="day-times">
                        {formatTimeIST(cell.punchIn)}
                        {cell.punchOut ? ` - ${formatTimeIST(cell.punchOut)}` : ""}
                      </div>
                    )}
                    {cell.status === "sunday" && <div className="day-times">Off</div>}
                    {cell.status === "leave" && <div className="day-times">Leave</div>}
                    {cell.status === "holiday" && <div className="day-times">Holiday</div>}
                    {cell.status === "uh" && <div className="day-times">UH</div>}
                    {cell.status === "absent" && <div className="day-times">Absent</div>}
                  </div>
                );
              })}
            </div>

            {tsData && (
              <section className="timesheet-summary">
                <article className="emp-status-card">
                  <div className="emp-status-header"><b>Hours Worked</b></div>
                  <div className="emp-status-detail"><strong>{tsData.totalHoursWorked}h</strong></div>
                </article>
                <article className="emp-status-card">
                  <div className="emp-status-header"><b>Present</b></div>
                  <div className="emp-status-detail"><strong>{tsData.presentDays}</strong><span className="pending-text">days</span></div>
                </article>
                {(tsData.halfDays ?? 0) > 0 && (
                  <article className="emp-status-card">
                    <div className="emp-status-header"><b>Half Day</b></div>
                    <div className="emp-status-detail"><strong>{tsData.halfDays}</strong><span className="pending-text">days</span></div>
                  </article>
                )}
                <article className="emp-status-card">
                  <div className="emp-status-header"><b>Absent</b></div>
                  <div className="emp-status-detail"><strong>{tsData.absentDays}</strong><span className="pending-text">days</span></div>
                </article>
                <article className="emp-status-card">
                  <div className="emp-status-header"><b>Leave</b></div>
                  <div className="emp-status-detail"><strong>{tsData.leaveDays}</strong><span className="pending-text">days</span></div>
                </article>
                {tsData.uhDays > 0 && (
                  <article className="emp-status-card">
                    <div className="emp-status-header"><b>UH</b></div>
                    <div className="emp-status-detail"><strong>{tsData.uhDays}</strong><span className="pending-text">days</span></div>
                  </article>
                )}
              </section>
            )}
          </div>
        )}
      </>
    );
  }

  // ── List View ──
  const initialListLoad = loading && !data;
  if (initialListLoad) return <>{toggleBar}<div className="table-card" style={{ padding: 48, textAlign: "center" }}>Loading history...</div></>;
  if (!data) return <>{toggleBar}<div className="table-card" style={{ padding: 48, textAlign: "center" }}>Could not load history.</div></>;

  return (
    <>
      {toggleBar}

      <div style={{ opacity: loading ? 0.45 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity .2s ease" }}>
        <section className="metrics">
          <article><span className="metric-icon green">&#10003;</span><div><small>Present</small><strong>{data.presentDays}</strong><em>days</em></div></article>
          <article><span className="metric-icon amber">&#9719;</span><div><small>Late</small><strong>{data.lateDays}</strong><em>days</em></div></article>
          <article><span className="metric-icon amber">&#189;</span><div><small>Half Day</small><strong>{data.halfDays}</strong><em>days</em></div></article>
          <article><span className="metric-icon red">&times;</span><div><small>Absent</small><strong>{data.absentDays}</strong><em>days</em></div></article>
          <article><span className="metric-icon purple">&#9673;</span><div><small>Leave</small><strong>{data.leaveDays}</strong><em>days</em></div></article>
          {(data.uhDays ?? 0) > 0 && (
            <article><span className="metric-icon amber">&#9632;</span><div><small>UH</small><strong>{data.uhDays}</strong><em>days</em></div></article>
          )}
        </section>

        <section className="table-card">
          <div className="table-tools">
            <div>
              <h2>Attendance History</h2>
              <p>{monthNames[month - 1]} {year} &mdash; {data.records.length} records</p>
            </div>
            {monthNav}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Punch In</th>
                  <th>Punch Out</th>
                  <th>Duration</th>
                  <th>Photo In</th>
                  <th>Photo Out</th>
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
                    <td>
                      {isRealPhoto(r.photoKeyIn) ? (
                        <img
                          className="table-thumb"
                          src={`/api/attendance/photo?key=${encodeURIComponent(r.photoKeyIn!)}`}
                          alt="In"
                          style={{ cursor: "pointer" }}
                          onClick={() => setViewPhoto(`/api/attendance/photo?key=${encodeURIComponent(r.photoKeyIn!)}`)}
                        />
                      ) : (
                        <span style={{ color: "#c9cbd4" }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td>
                      {isRealPhoto(r.photoKeyOut) ? (
                        <img
                          className="table-thumb"
                          src={`/api/attendance/photo?key=${encodeURIComponent(r.photoKeyOut!)}`}
                          alt="Out"
                          style={{ cursor: "pointer" }}
                          onClick={() => setViewPhoto(`/api/attendance/photo?key=${encodeURIComponent(r.photoKeyOut!)}`)}
                        />
                      ) : (
                        <span style={{ color: "#c9cbd4" }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td>
                      <span className={`grace-badge ${statusClass(r.status)}`}>{r.status}</span>
                      {r.lateByMinutes !== null && r.lateByMinutes > 0 && (
                        <small style={{ display: "block", color: "#e67e22", fontSize: 11, marginTop: 2 }}>
                          by {r.lateByMinutes >= 60
                            ? `${Math.floor(r.lateByMinutes / 60)}h ${r.lateByMinutes % 60}m`
                            : `${r.lateByMinutes} mins`}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
                {data.records.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No attendance records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {viewPhoto && (
        <div className="photo-overlay" onClick={() => setViewPhoto(null)}>
          <img src={viewPhoto} alt="Attendance selfie" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
