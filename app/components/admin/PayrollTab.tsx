"use client";

import { useEffect, useState } from "react";

type PayrollRow = {
  id: string;
  name: string;
  isFlexible: boolean;
  // Regular employee fields
  monthlySalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateAbsentDays: number;
  lateDays: number;
  leaveDays: number;
  sundayWorkedDays: number;
  sundayBonus: number;
  deduction: number;
  netPay: number;
  // Flex/hourly employee fields
  hourlyRate: number;
  totalHours: number;
};

export default function PayrollTab() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [workingDays, setWorkingDays] = useState(0);
  const [totalHolidays, setTotalHolidays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingSalary, setEditingSalary] = useState<string | null>(null);
  const [salaryValue, setSalaryValue] = useState("");
  const [search, setSearch] = useState("");

  function fetchPayroll() {
    setLoading(true);
    fetch(`/api/admin/payroll?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setRows(data.employees || []);
          setWorkingDays(data.workingDays || 0);
          setTotalHolidays(data.totalHolidays || 0);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchPayroll(); }, [month]);

  async function saveSalary(empId: string, isFlexible: boolean) {
    const value = parseInt(salaryValue, 10) || 0;
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isFlexible ? { id: empId, hourlyRate: value } : { id: empId, monthlySalary: value }),
    });
    setEditingSalary(null);
    fetchPayroll();
  }

  function fmt(n: number) {
    return `\u20B9${n.toLocaleString("en-IN")}`;
  }

  const totalSalary = rows.reduce((s, r) => s + r.monthlySalary, 0);
  const totalDeduction = rows.reduce((s, r) => s + r.deduction, 0);
  const totalSundayBonus = rows.reduce((s, r) => s + (r.sundayBonus || 0), 0);
  const totalNetPay = rows.reduce((s, r) => s + r.netPay, 0);

  return (
    <>
      <div className="date-picker-row">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <span style={{ fontSize: 15, color: "#667085" }}>
          Working days: <b>{workingDays}</b> &middot; Holidays: <b>{totalHolidays}</b>
        </span>
      </div>

      <section className="table-card">
        <div className="table-tools">
          <div><h2>Payroll</h2><p>{month} &middot; {rows.length} employees</p></div>
          <div className="filters">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or ID"
              aria-label="Search payroll"
              style={{ minWidth: 180 }}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Salary / Rate</th><th>Present / Hours</th><th>Absent</th><th>Late</th><th>Leave</th><th>Sun Work</th><th>Deduction</th><th>Sun Bonus</th><th>Net Pay</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
              ) : rows.filter((r) => {
                if (!search.trim()) return true;
                const q = search.trim().toLowerCase();
                return `${r.name} ${r.id}`.toLowerCase().includes(q);
              }).map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                    {r.isFlexible && <span style={{ marginLeft: 6, fontSize: 12, background: "#ede9fe", color: "#7c3aed", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>FLEX</span>}
                    <br /><small>{r.id}</small>
                  </td>
                  <td>
                    {editingSalary === r.id ? (
                      <input
                        className="salary-input"
                        type="number"
                        value={salaryValue}
                        onChange={(e) => setSalaryValue(e.target.value)}
                        onBlur={() => saveSalary(r.id, r.isFlexible)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveSalary(r.id, r.isFlexible); if (e.key === "Escape") setEditingSalary(null); }}
                        autoFocus
                      />
                    ) : r.isFlexible ? (
                      <span
                        style={{ cursor: "pointer", borderBottom: "1px dashed #c9cbd4" }}
                        onClick={() => { setEditingSalary(r.id); setSalaryValue(String(r.hourlyRate)); }}
                        title="Click to edit hourly rate"
                      >
                        {r.hourlyRate > 0 ? `${fmt(r.hourlyRate)}/hr` : "\u2014"}
                      </span>
                    ) : (
                      <span
                        style={{ cursor: "pointer", borderBottom: "1px dashed #c9cbd4" }}
                        onClick={() => { setEditingSalary(r.id); setSalaryValue(String(r.monthlySalary)); }}
                        title="Click to edit"
                      >
                        {r.monthlySalary > 0 ? fmt(r.monthlySalary) : "\u2014"}
                      </span>
                    )}
                  </td>
                  {r.isFlexible ? (
                    <>
                      <td><span className="grace-badge on-time">{r.totalHours > 0 ? `${r.totalHours}h` : "0h"}</span></td>
                      <td><span style={{ color: "#b0b5c0" }}>\u2014</span></td>
                      <td><span style={{ color: "#b0b5c0" }}>\u2014</span></td>
                      <td>{r.leaveDays}</td>
                      <td><span style={{ color: "#b0b5c0" }}>\u2014</span></td>
                      <td><span style={{ color: "#b0b5c0" }}>\u2014</span></td>
                      <td><span style={{ color: "#b0b5c0" }}>\u2014</span></td>
                    </>
                  ) : (
                    <>
                      <td><span className="grace-badge on-time">{r.presentDays}</span></td>
                      <td><span className="grace-badge late">{r.absentDays}</span></td>
                      <td>
                        {r.lateDays}
                        {r.lateAbsentDays > 0 && (
                          <div style={{ fontSize: 12, color: "#c73333", marginTop: 2 }}>= {r.lateAbsentDays} absent</div>
                        )}
                      </td>
                      <td>{r.leaveDays}</td>
                      <td>{r.sundayWorkedDays > 0 ? <span className="grace-badge grace">{r.sundayWorkedDays}</span> : <span style={{ color: "#b0b5c0" }}>0</span>}</td>
                      <td style={{ color: r.deduction > 0 ? "#c73333" : undefined }}>{r.deduction > 0 ? `-${fmt(r.deduction)}` : "\u2014"}</td>
                      <td style={{ color: r.sundayBonus > 0 ? "#168052" : undefined }}>{r.sundayBonus > 0 ? `+${fmt(r.sundayBonus)}` : "\u2014"}</td>
                    </>
                  )}
                  <td><b>{fmt(r.netPay)}</b></td>
                </tr>
              ))}
              {!loading && rows.length > 0 && (
                <tr className="totals-row">
                  <td><b>TOTALS</b></td>
                  <td><b>{fmt(totalSalary)}</b></td>
                  <td></td><td></td><td></td><td></td><td></td>
                  <td style={{ color: "#c73333" }}><b>{totalDeduction > 0 ? `-${fmt(totalDeduction)}` : "\u2014"}</b></td>
                  <td style={{ color: "#168052" }}><b>{totalSundayBonus > 0 ? `+${fmt(totalSundayBonus)}` : "\u2014"}</b></td>
                  <td><b>{fmt(totalNetPay)}</b></td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No data for this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
