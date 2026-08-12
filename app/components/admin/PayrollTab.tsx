"use client";

import { useEffect, useState } from "react";

type PayrollRow = {
  id: string;
  name: string;
  monthlySalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateAbsentDays: number;
  lateDays: number;
  leaveDays: number;
  deduction: number;
  netPay: number;
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

  async function saveSalary(empId: string) {
    const salary = parseInt(salaryValue, 10) || 0;
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: empId, monthlySalary: salary }),
    });
    setEditingSalary(null);
    fetchPayroll();
  }

  function fmt(n: number) {
    return `\u20B9${n.toLocaleString("en-IN")}`;
  }

  const totalSalary = rows.reduce((s, r) => s + r.monthlySalary, 0);
  const totalDeduction = rows.reduce((s, r) => s + r.deduction, 0);
  const totalNetPay = rows.reduce((s, r) => s + r.netPay, 0);

  return (
    <>
      <div className="date-picker-row">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <span style={{ fontSize: 13, color: "#667085" }}>
          Working days: <b>{workingDays}</b> &middot; Holidays: <b>{totalHolidays}</b>
        </span>
      </div>

      <section className="table-card">
        <div className="table-tools">
          <div><h2>Payroll</h2><p>{month} &middot; {rows.length} employees</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Monthly Salary</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>Deduction</th><th>Net Pay</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b><br /><small>{r.id}</small></td>
                  <td>
                    {editingSalary === r.id ? (
                      <input
                        className="salary-input"
                        type="number"
                        value={salaryValue}
                        onChange={(e) => setSalaryValue(e.target.value)}
                        onBlur={() => saveSalary(r.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveSalary(r.id); if (e.key === "Escape") setEditingSalary(null); }}
                        autoFocus
                      />
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
                  <td><span className="grace-badge on-time">{r.presentDays}</span></td>
                  <td><span className="grace-badge late">{r.absentDays}</span></td>
                  <td>
                    {r.lateDays}
                    {r.lateAbsentDays > 0 && (
                      <div style={{ fontSize: 10, color: "#c73333", marginTop: 2 }}>= {r.lateAbsentDays} absent</div>
                    )}
                  </td>
                  <td>{r.leaveDays}</td>
                  <td style={{ color: r.deduction > 0 ? "#c73333" : undefined }}>{r.deduction > 0 ? `-${fmt(r.deduction)}` : "\u2014"}</td>
                  <td><b>{fmt(r.netPay)}</b></td>
                </tr>
              ))}
              {!loading && rows.length > 0 && (
                <tr className="totals-row">
                  <td><b>TOTALS</b></td>
                  <td><b>{fmt(totalSalary)}</b></td>
                  <td></td><td></td><td></td><td></td>
                  <td style={{ color: "#c73333" }}><b>{totalDeduction > 0 ? `-${fmt(totalDeduction)}` : "\u2014"}</b></td>
                  <td><b>{fmt(totalNetPay)}</b></td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No data for this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
