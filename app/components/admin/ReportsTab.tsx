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

type ReportRow = {
  id: string;
  name: string;
  shift: string;
  jobRole: string;
  office: string;
  monthlySalary: number;
  createdAt: string;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  shortDays: number;
  lateAbsentDays: number;
  lateDays: number;
  leaveDays: number;
  uhDays: number;
  weeklyOffs: number;
  holidayCount: number;
  attendancePct: number;
  totalWorkedMinutes: number;
  sundayWorkedDays: number;
  sundayBonus: number;
  perDayRate: number;
  deduction: number;
  netPay: number;
  dailyDetails: DayDetail[];
};

function fmtDur(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function fmtTime(ts: string) {
  const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSummary(rows: ReportRow[], month: string, workingDays: number) {
  const header = ["Employee", "ID", "Shift", "Present", "Half Day", "Absent", "Short Day", "Late", "Late=Absent", "Leave", "UH", "Total Hours", "Attendance %"];
  const lines = rows.map((r) => [
    csvEscape(r.name), r.id, r.shift,
    String(r.presentDays), String(r.halfDays || 0), String(r.absentDays), String(r.shortDays || 0), String(r.lateDays), String(r.lateAbsentDays || 0), String(r.leaveDays), String(r.uhDays),
    fmtDur(r.totalWorkedMinutes), `${r.attendancePct}%`,
  ].join(","));
  const totals = rows.reduce((a, r) => ({
    p: a.p + r.presentDays, hd: a.hd + (r.halfDays || 0), ab: a.ab + r.absentDays, sd: a.sd + (r.shortDays || 0), l: a.l + r.lateDays, la: a.la + (r.lateAbsentDays || 0),
    lv: a.lv + r.leaveDays, u: a.u + r.uhDays, m: a.m + r.totalWorkedMinutes,
  }), { p: 0, hd: 0, ab: 0, sd: 0, l: 0, la: 0, lv: 0, u: 0, m: 0 });
  const avgPct = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.attendancePct, 0) / rows.length) : 0;
  lines.push(["TOTALS", "", "", String(totals.p), String(totals.hd), String(totals.ab), String(totals.sd), String(totals.l), String(totals.la), String(totals.lv), String(totals.u), fmtDur(totals.m), `${avgPct}%`].join(","));

  const csv = `Attendance Report - ${month} (Working Days: ${workingDays})\n\n${header.join(",")}\n${lines.join("\n")}`;
  downloadCsv(`attendance-report-${month}.csv`, csv);
}

function exportEmployeeDetail(emp: ReportRow, month: string) {
  const summaryRows = [
    `Employee Report - ${emp.name} (${emp.id})`,
    `Month: ${month}  |  Shift: ${emp.shift}`,
    "",
    `Present,${emp.presentDays}`,
    `Half Day,${emp.halfDays || 0}`,
    `Absent,${emp.absentDays}`,
    `Short Day,${emp.shortDays || 0}`,
    `Late,${emp.lateDays}`,
    `Late Ded.,${emp.lateAbsentDays || 0} days`,
    `Leave,${emp.leaveDays}`,
    `UH,${emp.uhDays}`,
    `Sunday Worked,${emp.sundayWorkedDays || 0}`,
    `Sunday Bonus,${emp.sundayBonus || 0}`,
    `Total Hours,${fmtDur(emp.totalWorkedMinutes)}`,
    `Attendance,${emp.attendancePct}%`,
    "",
  ];
  const header = "Date,Day,Punch In,Punch Out,Duration,Status";
  const dayLines = emp.dailyDetails.map((day) => {
    const d = new Date(day.date + "T00:00:00");
    const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
    const dateStr = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const badge = statusBadge[day.status] || statusBadge.absent;
    return [
      dateStr, dayName,
      day.punchIn ? fmtTime(day.punchIn) : "-",
      day.punchOut ? fmtTime(day.punchOut) : "-",
      day.durationMinutes !== null ? fmtDur(day.durationMinutes) : "-",
      badge.label,
    ].join(",");
  });

  const csv = summaryRows.join("\n") + header + "\n" + dayLines.join("\n");
  downloadCsv(`${emp.name.replace(/\s+/g, "-")}-report-${month}.csv`, csv);
}

const statusBadge: Record<string, { bg: string; color: string; label: string }> = {
  present: { bg: "#e8f7ef", color: "#168052", label: "Present" },
  late: { bg: "#fff4dc", color: "#a86400", label: "Late" },
  absent: { bg: "#ffeded", color: "#c73333", label: "Absent" },
  "half-day": { bg: "#fff4dc", color: "#a86400", label: "Half Day" },
  "short-day": { bg: "#ffeded", color: "#c73333", label: "Short Day" },
  leave: { bg: "#eff6ff", color: "#2563eb", label: "Leave" },
  uh: { bg: "#fff4dc", color: "#a86400", label: "UH" },
  sunday: { bg: "#f3f4f8", color: "#667085", label: "Sun" },
  "sunday-worked": { bg: "#dbeafe", color: "#1d4ed8", label: "Sun Work" },
  holiday: { bg: "#f3f4f8", color: "#667085", label: "Holiday" },
};

export default function ReportsTab() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [workingDays, setWorkingDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<ReportRow | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleExcelExport(emp: ReportRow) {
    setGenerating(true);
    try {
      const { generateEmployeeExcel } = await import("../../../lib/reports/generate-excel");
      await generateEmployeeExcel(emp, month, workingDays);
    } finally { setGenerating(false); }
  }

  async function handlePdfExport(emp: ReportRow) {
    setGenerating(true);
    try {
      const { generateEmployeePDF } = await import("../../../lib/reports/generate-pdf");
      await generateEmployeePDF(emp, month, workingDays);
    } finally { setGenerating(false); }
  }

  async function handleAllExcelExport() {
    setGenerating(true);
    try {
      const { generateAllEmployeesExcel } = await import("../../../lib/reports/generate-excel");
      await generateAllEmployeesExcel(rows, month, workingDays);
    } finally { setGenerating(false); }
  }

  async function handleAllPdfExport() {
    setGenerating(true);
    try {
      const { generateAllEmployeesPDF } = await import("../../../lib/reports/generate-pdf");
      await generateAllEmployeesPDF(rows, month, workingDays);
    } finally { setGenerating(false); }
  }

  useEffect(() => {
    setLoading(true);
    setSelectedEmp(null);
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
      halfDay: acc.halfDay + (r.halfDays || 0),
      absent: acc.absent + r.absentDays,
      late: acc.late + r.lateDays,
      leave: acc.leave + r.leaveDays,
      uh: acc.uh + r.uhDays,
      minutes: acc.minutes + r.totalWorkedMinutes,
    }),
    { present: 0, halfDay: 0, absent: 0, late: 0, leave: 0, uh: 0, minutes: 0 },
  );
  const avgPct = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.attendancePct, 0) / rows.length) : 0;

  return (
    <>
      <div className="date-picker-row">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <span style={{ fontSize: 13, color: "#667085" }}>Working days: <b>{workingDays}</b></span>
        {rows.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button className="export" onClick={() => exportSummary(rows, month, workingDays)} disabled={generating}>CSV</button>
            <button className="export" onClick={handleAllExcelExport} disabled={generating}>{generating ? "..." : "Excel"}</button>
            <button className="export" onClick={handleAllPdfExport} disabled={generating}>{generating ? "..." : "PDF"}</button>
          </div>
        )}
      </div>

      {/* Employee Detail Panel */}
      {selectedEmp && (
        <section style={{
          background: "#fff", border: "1px solid var(--line)", borderRadius: 18,
          padding: 24, marginBottom: 20, boxShadow: "0 5px 24px rgba(25,28,39,.04)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{
              width: 48, height: 48, borderRadius: "50%", background: "#6d45e5", color: "#fff",
              display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16, flexShrink: 0,
            }}>
              {selectedEmp.name.slice(0, 2).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedEmp.name}</div>
              <div style={{ fontSize: 12, color: "#667085" }}>
                {selectedEmp.id} &middot; {selectedEmp.jobRole || "Employee"} &middot; {selectedEmp.office}
              </div>
              <div style={{ fontSize: 11, color: "#8990a0" }}>Shift: {selectedEmp.shift}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => exportEmployeeDetail(selectedEmp, month)} disabled={generating}
                style={{ border: "1px solid var(--purple)", background: "#eee9ff", color: "#6d45e5", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                CSV
              </button>
              <button onClick={() => handleExcelExport(selectedEmp)} disabled={generating}
                style={{ border: "1px solid var(--purple)", background: "#eee9ff", color: "#6d45e5", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {generating ? "..." : "Excel"}
              </button>
              <button onClick={() => handlePdfExport(selectedEmp)} disabled={generating}
                style={{ border: "1px solid var(--purple)", background: "#eee9ff", color: "#6d45e5", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {generating ? "..." : "PDF"}
              </button>
            </div>
            <button
              onClick={() => setSelectedEmp(null)}
              style={{
                border: "1px solid var(--line)", background: "#fff", padding: "8px 16px",
                borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          {/* Summary cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 10, marginBottom: 20,
          }}>
            {[
              { label: "Present", value: selectedEmp.presentDays, bg: "#e8f7ef", color: "#168052" },
              ...(selectedEmp.halfDays > 0 ? [{ label: "Half Day", value: selectedEmp.halfDays, bg: "#fff4dc", color: "#a86400" }] : []),
              { label: "Absent", value: selectedEmp.absentDays, bg: "#ffeded", color: "#c73333" },
              ...(selectedEmp.shortDays > 0 ? [{ label: "Short Day", value: selectedEmp.shortDays, bg: "#ffeded", color: "#c73333" }] : []),
              { label: "Late", value: selectedEmp.lateDays, bg: "#fff4dc", color: "#a86400" },
              { label: "Leave", value: selectedEmp.leaveDays, bg: "#eff6ff", color: "#2563eb" },
              { label: "Total Hours", value: fmtDur(selectedEmp.totalWorkedMinutes), bg: "#eee9ff", color: "#6d45e5" },
              { label: "Attendance", value: `${selectedEmp.attendancePct}%`, bg: selectedEmp.attendancePct >= 90 ? "#e8f7ef" : "#fff4dc", color: selectedEmp.attendancePct >= 90 ? "#168052" : "#a86400" },
              ...(selectedEmp.monthlySalary > 0 ? [
                { label: "Salary", value: `\u20B9${selectedEmp.monthlySalary.toLocaleString("en-IN")}`, bg: "#f9fafb", color: "#172033" },
                { label: "Deduction", value: selectedEmp.deduction > 0 ? `-\u20B9${selectedEmp.deduction.toLocaleString("en-IN")}` : "\u2014", bg: "#ffeded", color: "#c73333" },
                ...(selectedEmp.sundayBonus > 0 ? [
                  { label: "Sun Bonus", value: `+\u20B9${selectedEmp.sundayBonus.toLocaleString("en-IN")}`, bg: "#dbeafe", color: "#1d4ed8" },
                ] : []),
                { label: "Net Pay", value: `\u20B9${selectedEmp.netPay.toLocaleString("en-IN")}`, bg: "#e8f7ef", color: "#168052" },
              ] : []),
            ].map((c) => (
              <div key={c.label} style={{
                background: c.bg, borderRadius: 12, padding: "12px 14px", textAlign: "center",
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: c.color, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Daily breakdown table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>
                  {["Date", "Punch In", "Punch Out", "Break", "Work Hours", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: "#8990a0", background: "#f9fafb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedEmp.dailyDetails.map((day) => {
                  const badge = statusBadge[day.status] || statusBadge.absent;
                  const isOff = (day.status === "sunday" || day.status === "holiday");
                  return (
                    <tr key={day.date} style={{ background: isOff ? "#fafafa" : undefined }}>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 13, fontWeight: 600 }}>
                        {fmtDate(day.date)}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 13 }}>
                        {day.punchIn ? fmtTime(day.punchIn) : "\u2014"}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 13 }}>
                        {day.punchOut ? fmtTime(day.punchOut) : "\u2014"}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 13, color: "#a86400" }}>
                        {day.breakMinutes ? fmtDur(day.breakMinutes) : "\u2014"}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 13, fontWeight: day.durationMinutes ? 700 : 400 }}>
                        {day.durationMinutes !== null ? fmtDur(day.durationMinutes) : "\u2014"}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3" }}>
                        <span style={{
                          fontSize: 10, padding: "4px 10px", borderRadius: 99, fontWeight: 600,
                          background: badge.bg, color: badge.color,
                        }}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Main report table */}
      <section className="table-card">
        <div className="table-tools">
          <div><h2>Attendance Report</h2><p>{month} &middot; {rows.length} employees</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Present</th><th>Half Day</th><th>Absent</th><th>Late</th><th>Leave</th><th>UH</th><th>Hours</th><th>Attendance</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
              ) : rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedEmp(r)}
                  style={{ cursor: "pointer", background: selectedEmp?.id === r.id ? "#f6f2ff" : undefined }}
                >
                  <td>
                    <div className="cell-flex">
                      <span className="person" style={{ background: "#6d45e5", color: "#fff" }}>{r.name.slice(0, 2).toUpperCase()}</span>
                      <span><b>{r.name}</b><small>{r.id}</small></span>
                    </div>
                  </td>
                  <td><span className="grace-badge on-time">{r.presentDays}</span></td>
                  <td>{r.halfDays > 0 ? <span className="grace-badge grace">{r.halfDays}</span> : <span style={{ color: "#b0b5c0" }}>0</span>}</td>
                  <td><span className="grace-badge late">{r.absentDays}</span></td>
                  <td>
                    <span className="grace-badge grace">{r.lateDays}</span>
                    {r.lateAbsentDays > 0 && (
                      <div style={{ fontSize: 10, color: "#c73333", marginTop: 2 }}>= {r.lateAbsentDays}d ded.</div>
                    )}
                  </td>
                  <td>{r.leaveDays}</td>
                  <td>{r.uhDays}</td>
                  <td style={{ fontWeight: 600, color: "#6d45e5" }}>{fmtDur(r.totalWorkedMinutes)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#f0f1f5", borderRadius: 99, overflow: "hidden", minWidth: 50 }}>
                        <div style={{
                          height: "100%", borderRadius: 99,
                          width: `${r.attendancePct}%`,
                          background: r.attendancePct >= 90 ? "#22c55e" : r.attendancePct >= 75 ? "#f59e0b" : "#ef4444",
                        }} />
                      </div>
                      <b style={{ fontSize: 12, minWidth: 32 }}>{r.attendancePct}%</b>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length > 0 && (
                <tr className="totals-row">
                  <td><b>TOTALS</b></td>
                  <td><b>{totals.present}</b></td>
                  <td><b>{totals.halfDay}</b></td>
                  <td><b>{totals.absent}</b></td>
                  <td><b>{totals.late}</b></td>
                  <td><b>{totals.leave}</b></td>
                  <td><b>{totals.uh}</b></td>
                  <td style={{ fontWeight: 700, color: "#6d45e5" }}>{fmtDur(totals.minutes)}</td>
                  <td><b>{avgPct}%</b></td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No data for this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
