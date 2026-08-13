"use client";

import { useEffect, useState } from "react";

type DayDetail = {
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  durationMinutes: number | null;
  breakMinutes: number | null;
  status: string;
};

type ReportData = {
  id: string;
  name: string;
  shift: string;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  weeklyOffs: number;
  holidayCount: number;
  dailyDetails: DayDetail[];
};

const statusBadge: Record<string, { bg: string; color: string; label: string; short: string }> = {
  present: { bg: "#e8f7ef", color: "#168052", label: "Present", short: "P" },
  late: { bg: "#fff4dc", color: "#a86400", label: "Late", short: "LC" },
  absent: { bg: "#ffeded", color: "#c73333", label: "Absent", short: "A" },
  leave: { bg: "#eff6ff", color: "#2563eb", label: "Leave", short: "L" },
  uh: { bg: "#fff4dc", color: "#a86400", label: "Unpaid Holiday", short: "UH" },
  sunday: { bg: "#f3f4f8", color: "#667085", label: "Weekly Off", short: "WO" },
  holiday: { bg: "#f3f4f8", color: "#667085", label: "Holiday", short: "H" },
};

function fmtTime(ts: string): string {
  const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") || ts.includes("+") ? "" : "Z"));
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short" });
}

function fmtMonth(month: string): string {
  const [y, m] = month.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function StaffDatewiseModal({ employeeId, employeeName, onClose }: { employeeId: string; employeeName: string; onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/reports?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.employees) {
          const emp = res.employees.find((e: ReportData) => e.id === employeeId);
          setData(emp || null);
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month, employeeId]);

  function prevMonth() {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function nextMonth() {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m, 1);
    const now = new Date();
    if (d > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const initials = employeeName.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: "90vh", overflow: "auto" }}>
        <div className="modal-header">
          <h2>Employee Datewise Status</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Employee header + month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", background: "#6d45e5", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
              {initials}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{employeeName}</div>
              <div style={{ fontSize: 12, color: "#667085" }}>{employeeId}{data ? ` \u00B7 Shift: ${data.shift}` : ""}</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={prevMonth} style={{ background: "none", border: "1px solid #e7e9ee", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 16 }}>&lsaquo;</button>
            <span style={{ fontWeight: 600, fontSize: 14, minWidth: 140, textAlign: "center" }}>{fmtMonth(month)}</span>
            <button onClick={nextMonth} style={{ background: "none", border: "1px solid #e7e9ee", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 16 }}>&rsaquo;</button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#667085" }}>Loading attendance data...</div>
        ) : !data ? (
          <div style={{ textAlign: "center", padding: 48, color: "#667085" }}>No data available for this month.</div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Present", value: data.presentDays, bg: "#e8f7ef", color: "#168052" },
                { label: "Absent", value: data.absentDays, bg: "#ffeded", color: "#c73333" },
                { label: "Late", value: data.lateDays, bg: "#fff4dc", color: "#a86400" },
                { label: "Leave", value: data.leaveDays, bg: "#eff6ff", color: "#2563eb" },
                { label: "Wkly Off", value: data.weeklyOffs, bg: "#f3f4f8", color: "#667085" },
                { label: "Holiday", value: data.holidayCount, bg: "#f3f4f8", color: "#667085" },
              ].map((c) => (
                <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: c.color, textTransform: "uppercase", letterSpacing: ".04em" }}>{c.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Daily table */}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Punch In</th>
                    <th>Punch Out</th>
                    <th>Work Hrs</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyDetails.map((day) => {
                    const badge = statusBadge[day.status] || statusBadge.absent;
                    const isOff = day.status === "sunday" || day.status === "holiday";
                    return (
                      <tr key={day.date} style={{ background: isOff ? "#fafafa" : undefined }}>
                        <td>{fmtDate(day.date)}</td>
                        <td>{fmtDay(day.date)}</td>
                        <td>{day.punchIn ? fmtTime(day.punchIn) : "\u2014"}</td>
                        <td>{day.punchOut ? fmtTime(day.punchOut) : "\u2014"}</td>
                        <td>{day.durationMinutes ? fmtDur(day.durationMinutes) : "\u2014"}</td>
                        <td>
                          <span style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 99,
                            fontSize: 11,
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                            whiteSpace: "nowrap",
                          }}>
                            {badge.short} | {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {data.dailyDetails.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No attendance data for this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
