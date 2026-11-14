"use client";

import { useEffect, useState } from "react";
import { groupByCategory } from "./rule-meta";
import PayslipPublishBar from "./PayslipPublishBar";

type SessionInfo = {
  inTime: string;
  outTime: string | null;
  durationMinutes: number | null;
};

type DayDetail = {
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  durationMinutes: number | null;
  breakMinutes: number | null;
  status: string;
  overtimeMinutes?: number;
  sessions?: SessionInfo[];
};

type ReportRow = {
  id: string;
  name: string;
  shift: string;
  jobRole: string;
  office: string;
  monthlySalary: number;
  createdAt: string;
  isFlexible?: boolean;
  hourlyRate?: number;
  presentDays: number;
  absentDays: number;
  missedPunchOutDays?: number;
  missedPunchInDays?: number;
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
  weekOffWorkedDays: number;
  weekOffBonus: number;
  overtimeMinutes?: number;
  overtimePay?: number;
  lateFine?: number;
  unpaidLeaveDays?: number;
  perDayRate: number;
  deduction: number;
  netPay: number;
  dailyDetails: DayDetail[];
  salaryLines?: { label: string; detail: string; amount: number; kind: "base" | "deduction" | "extra" | "info" }[];
  rulesApplied?: { id: string; label: string; category: string; valueType: string; value: string; custom: boolean }[];
};

const inr = (n: number) => `\u20B9${Math.round(n).toLocaleString("en-IN")}`;

/** Salary worked out line by line, plus every rule (and its value) used for this employee. */
function SalaryAndRules({ emp }: { emp: ReportRow }) {
  const [showRules, setShowRules] = useState(false);
  const lines = emp.salaryLines ?? [];
  const rules = emp.rulesApplied ?? [];
  const customCount = rules.filter((r) => r.custom).length;
  const cell: React.CSSProperties = { padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 14, verticalAlign: "top" };

  return (
    <div style={{ marginBottom: 20 }}>
      {lines.length > 0 ? (
        <div style={{ border: "1px solid #eff0f3", borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ padding: "12px 14px", fontWeight: 800, fontSize: 15, background: "#f9fafb" }}>Salary breakdown</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.label}>
                    <td style={{ ...cell, fontWeight: 700, whiteSpace: "nowrap" }}>{l.label}</td>
                    <td style={{ ...cell, color: "#667085" }}>{l.detail}</td>
                    <td style={{
                      ...cell, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap",
                      color: l.amount < 0 ? "#c73333" : l.kind === "extra" ? "#168052" : "#172033",
                    }}>
                      {l.kind === "info" ? "\u2014" : l.amount < 0 ? `\u2212${inr(-l.amount)}` : l.kind === "extra" ? `+${inr(l.amount)}` : inr(l.amount)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "#e8f7ef" }}>
                  <td style={{ ...cell, fontWeight: 800, color: "#168052" }}>Net pay</td>
                  <td style={{ ...cell, color: "#168052" }}>Monthly salary &minus; deductions + extra pay</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 800, color: "#168052", fontSize: 16 }}>{inr(emp.netPay)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: "#667085", margin: "0 0 12px" }}>
          {emp.isFlexible
            ? "Hourly (flexible) employee: paid hours worked \u00D7 hourly rate, so day-based salary rules don't apply."
            : "No monthly salary set for this employee, so no salary is calculated."}
        </p>
      )}

      {rules.length > 0 && (
        <div style={{ border: "1px solid #eff0f3", borderRadius: 14, overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            aria-expanded={showRules}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 14px", border: 0, background: "#f9fafb", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontWeight: 800, fontSize: 15 }}>
              Rules applied
              <span style={{ fontWeight: 600, fontSize: 13, color: "#667085", marginLeft: 8 }}>
                {customCount > 0 ? `${customCount} custom for this employee` : "all company defaults"}
              </span>
            </span>
            <span style={{ color: "#6d45e5", fontWeight: 700, fontSize: 14 }}>{showRules ? "Hide \u25B2" : "Show \u25BC"}</span>
          </button>
          {showRules && groupByCategory(rules).map((g) => (
            <div key={g.id}>
              <div style={{ padding: "10px 14px 4px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "#6d45e5", borderTop: "1px solid #eff0f3" }}>{g.title}</div>
              {g.items.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 14px", fontSize: 14 }}>
                  <span>{r.label}</span>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                    {r.valueType === "boolean" ? (r.value === "true" ? "On" : "Off") : r.value}
                    {r.custom && <span className="grace-badge grace" style={{ marginLeft: 8 }}>Custom</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
          {showRules && <div style={{ height: 8 }} />}
        </div>
      )}
    </div>
  );
}

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

const statusBadge: Record<string, { bg: string; color: string; label: string }> = {
  present: { bg: "#e8f7ef", color: "#168052", label: "Present" },
  late: { bg: "#fff4dc", color: "#a86400", label: "Late" },
  absent: { bg: "#ffeded", color: "#c73333", label: "Absent" },
  "missed-out": { bg: "#fce7f3", color: "#be185d", label: "Missed Punch-Out" },
  "missed-in": { bg: "#fce7f3", color: "#be185d", label: "Missed Punch-In" },
  "in-progress": { bg: "#eff6ff", color: "#2563eb", label: "In Progress" },
  "half-day": { bg: "#fff4dc", color: "#a86400", label: "Half Day" },
  "short-day": { bg: "#ffeded", color: "#c73333", label: "Short Day" },
  leave: { bg: "#eff6ff", color: "#2563eb", label: "Leave" },
  "unpaid-leave": { bg: "#ffeded", color: "#c73333", label: "Unpaid Leave" },
  uh: { bg: "#fff4dc", color: "#a86400", label: "UH" },
  "week-off": { bg: "#f3f4f8", color: "#667085", label: "WO" },
  "weekoff-worked": { bg: "#dbeafe", color: "#1d4ed8", label: "WO Worked" },
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
  const [search, setSearch] = useState("");

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

  async function handleFlatExcelExport() {
    setGenerating(true);
    try {
      const { generateFlatReportExcel } = await import("../../../lib/reports/generate-excel");
      await generateFlatReportExcel(rows, month, workingDays);
    } finally { setGenerating(false); }
  }

  async function handleRawExcelExport() {
    setGenerating(true);
    try {
      const { generateRawReportExcel } = await import("../../../lib/reports/generate-excel");
      await generateRawReportExcel(rows, month, workingDays);
    } finally { setGenerating(false); }
  }

  async function handleFlexExcelExport() {
    setGenerating(true);
    try {
      const { generateFlexReportExcel } = await import("../../../lib/reports/generate-excel");
      await generateFlexReportExcel(rows, month);
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

  function fetchReports(silent = false) {
    if (!silent) { setLoading(true); setSelectedEmp(null); }
    fetch(`/api/admin/reports?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setRows(data.employees || []);
          setWorkingDays(data.workingDays || 0);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!silent) setLoading(false); });
  }

  useEffect(() => {
    fetchReports();
    const id = setInterval(() => fetchReports(true), 30000);
    return () => clearInterval(id);
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

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  function openEmployee(r: ReportRow) {
    setSelectedEmp(r);
    window.scrollTo({ top: 0 });
  }
  function closeEmployee() {
    setSelectedEmp(null);
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      {!selectedEmp && (
      <div className="date-picker-row">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <span style={{ fontSize: 15, color: "#667085" }}>Working days: <b>{workingDays}</b></span>
        {rows.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            {/* <button className="export" onClick={handleRawExcelExport} disabled={generating}>{generating ? "..." : "Excel 1"}</button>
            <button className="export" onClick={handleFlatExcelExport} disabled={generating}>{generating ? "..." : "Excel 2"}</button> */}
            <button className="export" onClick={handleAllExcelExport} disabled={generating}>{generating ? "..." : "Excel"}</button>
            <button className="export" onClick={handleAllPdfExport} disabled={generating}>{generating ? "..." : "PDF"}</button>
            {rows.some((r) => r.isFlexible) && (
              <button className="export" onClick={handleFlexExcelExport} disabled={generating}>{generating ? "..." : "Flexible Employee Excel"}</button>
            )}

          </div>
        )}
      </div>
      )}

      {!selectedEmp && <PayslipPublishBar key={month} month={month} />}

      {/* Employee detail opens as its own page in place of the report list */}
      {selectedEmp && (
        <button type="button" className="admin-page-back" onClick={closeEmployee}>
          &larr; Back to Reports &middot; {monthLabel}
        </button>
      )}
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
              <div style={{ fontSize: 14, color: "#667085" }}>
                {selectedEmp.id} &middot; {selectedEmp.jobRole || "Employee"} &middot; {selectedEmp.office}
              </div>
              <div style={{ fontSize: 13, color: "#8990a0" }}>Shift: {selectedEmp.shift}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => handleExcelExport(selectedEmp)} disabled={generating}
                style={{ border: "1px solid var(--purple)", background: "#eee9ff", color: "#6d45e5", padding: "8px 12px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {generating ? "..." : "Excel"}
              </button>
              <button onClick={() => handlePdfExport(selectedEmp)} disabled={generating}
                style={{ border: "1px solid var(--purple)", background: "#eee9ff", color: "#6d45e5", padding: "8px 12px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {generating ? "..." : "PDF"}
              </button>
            </div>
            <button
              onClick={closeEmployee}
              style={{
                border: "1px solid var(--line)", background: "#fff", padding: "8px 16px",
                borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}
            >
              Back
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
              ...(selectedEmp.missedPunchOutDays ? [{ label: "Missed Punch-Out", value: selectedEmp.missedPunchOutDays, bg: "#fce7f3", color: "#be185d" }] : []),
              ...(selectedEmp.missedPunchInDays ? [{ label: "Missed Punch-In", value: selectedEmp.missedPunchInDays, bg: "#fce7f3", color: "#be185d" }] : []),
              ...(selectedEmp.shortDays > 0 ? [{ label: "Short Day", value: selectedEmp.shortDays, bg: "#ffeded", color: "#c73333" }] : []),
              { label: "Late", value: selectedEmp.lateDays, bg: "#fff4dc", color: "#a86400" },
              { label: "Leave", value: selectedEmp.leaveDays, bg: "#eff6ff", color: "#2563eb" },
              ...(selectedEmp.unpaidLeaveDays ? [{ label: "Unpaid Leave", value: selectedEmp.unpaidLeaveDays, bg: "#ffeded", color: "#c73333" }] : []),
              { label: "Total Hours", value: fmtDur(selectedEmp.totalWorkedMinutes), bg: "#eee9ff", color: "#6d45e5" },
              { label: "Attendance", value: `${selectedEmp.attendancePct}%`, bg: selectedEmp.attendancePct >= 90 ? "#e8f7ef" : "#fff4dc", color: selectedEmp.attendancePct >= 90 ? "#168052" : "#a86400" },
              ...(selectedEmp.monthlySalary > 0 ? [
                { label: "Salary", value: `\u20B9${selectedEmp.monthlySalary.toLocaleString("en-IN")}`, bg: "#f9fafb", color: "#172033" },
                { label: "Deduction", value: selectedEmp.deduction > 0 ? `-\u20B9${selectedEmp.deduction.toLocaleString("en-IN")}` : "\u2014", bg: "#ffeded", color: "#c73333" },
                ...(selectedEmp.lateFine ? [
                  { label: "Late Fine", value: `-\u20B9${selectedEmp.lateFine.toLocaleString("en-IN")}`, bg: "#ffeded", color: "#c73333" },
                ] : []),
                ...(selectedEmp.overtimePay ? [
                  { label: `Overtime ${fmtDur(selectedEmp.overtimeMinutes || 0)}`, value: `+\u20B9${selectedEmp.overtimePay.toLocaleString("en-IN")}`, bg: "#e8f7ef", color: "#168052" },
                ] : []),
                ...(selectedEmp.weekOffBonus > 0 ? [
                  { label: "WO Extra Pay", value: `+\u20B9${selectedEmp.weekOffBonus.toLocaleString("en-IN")}`, bg: "#dbeafe", color: "#1d4ed8" },
                ] : []),
                { label: "Net Pay", value: `\u20B9${selectedEmp.netPay.toLocaleString("en-IN")}`, bg: "#e8f7ef", color: "#168052" },
              ] : []),
            ].map((c) => (
              <div key={c.label} style={{
                background: c.bg, borderRadius: 12, padding: "12px 14px", textAlign: "center",
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.color, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          <SalaryAndRules emp={selectedEmp} />

          {/* Daily breakdown table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>
                  {["Date", "Punch In", "Punch Out", "Break", "Work Hours", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#8990a0", background: "#f9fafb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedEmp.dailyDetails.map((day) => {
                  const badge = statusBadge[day.status] || statusBadge.absent;
                  const isOff = (day.status === "week-off" || day.status === "holiday");
                  return (
                    <tr key={day.date} style={{ background: isOff ? "#fafafa" : undefined }}>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 15, fontWeight: 600 }}>
                        {fmtDate(day.date)}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 15 }}>
                        {day.punchIn ? fmtTime(day.punchIn) : "\u2014"}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 15 }}>
                        {day.punchOut ? fmtTime(day.punchOut) : "\u2014"}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 15, color: "#a86400" }}>
                        {day.breakMinutes ? fmtDur(day.breakMinutes) : "\u2014"}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3", fontSize: 15, fontWeight: day.durationMinutes ? 700 : 400 }}>
                        {day.durationMinutes !== null ? fmtDur(day.durationMinutes) : "\u2014"}
                        {day.overtimeMinutes ? (
                          <div style={{ fontSize: 12, color: "#168052", fontWeight: 700, marginTop: 2 }}>+{fmtDur(day.overtimeMinutes)} OT</div>
                        ) : null}
                      </td>
                      <td style={{ padding: "10px 14px", borderTop: "1px solid #eff0f3" }}>
                        <span style={{
                          fontSize: 12, padding: "4px 10px", borderRadius: 99, fontWeight: 600,
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
      {!selectedEmp && (
      <section className="table-card">
        <div className="table-tools">
          <div><h2>Attendance Report</h2><p>{month} &middot; {rows.length} employees</p></div>
          <div className="filters">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or emp-ID"
              aria-label="Search reports"
              style={{ minWidth: 260 , padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)" }}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Present</th><th>Half Day</th><th>Absent</th><th>Late</th><th>Leave</th><th>UH</th><th>Hours</th><th>Attendance</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
              ) : rows.filter((r) => {
                if (!search.trim()) return true;
                const q = search.trim().toLowerCase();
                return `${r.name} ${r.id}`.toLowerCase().includes(q);
              }).map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openEmployee(r)}
                  style={{ cursor: "pointer" }}
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
                      <div style={{ fontSize: 12, color: "#c73333", marginTop: 2 }}>= {r.lateAbsentDays}d ded.</div>
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
                      <b style={{ fontSize: 14, minWidth: 32 }}>{r.attendancePct}%</b>
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
      )}
    </>
  );
}
