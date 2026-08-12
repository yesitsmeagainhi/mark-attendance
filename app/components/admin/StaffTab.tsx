"use client";

import { useEffect, useState } from "react";
import type { EmployeeRow, BranchRow } from "./types";
import AddEmployeeModal from "./AddEmployeeModal";
import EmployeeRulesModal from "./EmployeeRulesModal";

export default function StaffTab() {
  const [employeeList, setEmployeeList] = useState<EmployeeRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSalary, setEditingSalary] = useState<string | null>(null);
  const [salaryValue, setSalaryValue] = useState("");
  const [rulesEmployee, setRulesEmployee] = useState<{ id: string; name: string } | null>(null);

  function fetchEmployees() {
    fetch("/api/employees")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.employees) setEmployeeList(data.employees); })
      .catch(() => undefined);
  }

  function fetchBranches() {
    fetch("/api/branches")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.branches) setBranches(data.branches); })
      .catch(() => undefined);
  }

  useEffect(() => { fetchEmployees(); fetchBranches(); }, []);

  async function saveSalary(empId: string) {
    const salary = parseInt(salaryValue, 10) || 0;
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: empId, monthlySalary: salary }),
    });
    setEditingSalary(null);
    fetchEmployees();
  }

  return (
    <>
      <section className="table-card">
        <div className="table-tools">
          <div><h2>Registered employees</h2><p>{employeeList.length} total</p></div>
          <div className="filters">
            <button className="primary" style={{ fontSize: 13, padding: "6px 14px" }} onClick={() => setShowAddModal(true)}>+ Add employee</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Contact</th><th>Job role</th><th>Work hours</th><th>Office</th><th>Salary</th><th>Rules</th><th>Status</th><th>Added</th></tr></thead>
            <tbody>
              {employeeList.map((emp) => {
                const initials = emp.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                const color = ["#7c3aed", "#2563eb", "#059669", "#db2777", "#ea580c"][emp.id.charCodeAt(emp.id.length - 1) % 5];
                return (
                  <tr key={emp.id}>
                    <td className="cell-flex"><span className="person" style={{ background: color }}>{initials}</span><span><b>{emp.name}</b><small>{emp.id}</small></span></td>
                    <td className="cell-flex"><span><b>{emp.email}</b><small>{emp.mobileNumber || "\u2014"}</small></span></td>
                    <td>{emp.jobRole || "\u2014"}</td>
                    <td>{emp.workStartTime && emp.workEndTime ? `${emp.workStartTime} \u2013 ${emp.workEndTime}` : "\u2014"}</td>
                    <td>{emp.office}</td>
                    <td>
                      {editingSalary === emp.id ? (
                        <input
                          className="salary-input"
                          type="number"
                          value={salaryValue}
                          onChange={(e) => setSalaryValue(e.target.value)}
                          onBlur={() => saveSalary(emp.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveSalary(emp.id); if (e.key === "Escape") setEditingSalary(null); }}
                          autoFocus
                        />
                      ) : (
                        <span
                          style={{ cursor: "pointer", borderBottom: "1px dashed #c9cbd4" }}
                          onClick={() => { setEditingSalary(emp.id); setSalaryValue(String(emp.monthlySalary || 0)); }}
                          title="Click to edit salary"
                        >
                          {emp.monthlySalary > 0 ? `\u20B9${emp.monthlySalary.toLocaleString("en-IN")}` : "\u2014"}
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="btn-approve" style={{ fontSize: 12 }} onClick={() => setRulesEmployee({ id: emp.id, name: emp.name })}>Rules</button>
                    </td>
                    <td><span className={`status ${emp.active ? "" : "absent"}`}>&#9679; {emp.active ? "Active" : "Inactive"}</span></td>
                    <td><small>{new Date(emp.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</small></td>
                  </tr>
                );
              })}
              {employeeList.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No employees registered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <AddEmployeeModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={fetchEmployees}
        branches={branches}
      />

      {rulesEmployee && (
        <EmployeeRulesModal
          open={true}
          employeeId={rulesEmployee.id}
          employeeName={rulesEmployee.name}
          onClose={() => setRulesEmployee(null)}
        />
      )}
    </>
  );
}
