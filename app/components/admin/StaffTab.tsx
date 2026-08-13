"use client";

import { useEffect, useState, useRef } from "react";
import type { EmployeeRow, BranchRow, DepartmentRow } from "./types";
import AddEmployeeModal from "./AddEmployeeModal";
import EmployeeRulesModal from "./EmployeeRulesModal";
import StaffDetailModal from "./StaffDetailModal";
import StaffDatewiseModal from "./StaffDatewiseModal";
import EditEmployeeModal from "./EditEmployeeModal";

export default function StaffTab() {
  const [employeeList, setEmployeeList] = useState<EmployeeRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSalary, setEditingSalary] = useState<string | null>(null);
  const [salaryValue, setSalaryValue] = useState("");
  const [rulesEmployee, setRulesEmployee] = useState<{ id: string; name: string } | null>(null);
  const [menuEmployee, setMenuEmployee] = useState<{ emp: EmployeeRow; x: number; y: number } | null>(null);
  const [detailEmployee, setDetailEmployee] = useState<EmployeeRow | null>(null);
  const [datewiseEmployee, setDatewiseEmployee] = useState<{ id: string; name: string } | null>(null);
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  function fetchDepartments() {
    fetch("/api/departments")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.departments) setDepartments(data.departments); })
      .catch(() => undefined);
  }

  useEffect(() => { fetchEmployees(); fetchBranches(); fetchDepartments(); }, []);

  // Close popup on outside click
  useEffect(() => {
    if (!menuEmployee) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuEmployee(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuEmployee]);

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
            <thead><tr><th>Employee</th><th>Contact</th><th>Job role</th><th>Department</th><th>Work hours</th><th>Office</th><th>Salary</th><th>Rules</th><th>Status</th><th>Added</th></tr></thead>
            <tbody>
              {employeeList.map((emp) => {
                const initials = emp.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                const color = ["#7c3aed", "#2563eb", "#059669", "#db2777", "#ea580c"][emp.id.charCodeAt(emp.id.length - 1) % 5];
                return (
                  <tr key={emp.id} style={{ cursor: "pointer" }} onClick={(e) => {
                    // Don't open menu if clicking salary edit or rules button
                    if ((e.target as HTMLElement).closest("input, button")) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuEmployee({ emp, x: e.clientX, y: rect.bottom });
                  }}>
                    <td className="cell-flex"><span className="person" style={{ background: color }}>{initials}</span><span><b>{emp.name}</b><small>{emp.id}</small></span></td>
                    <td className="cell-flex"><span><b>{emp.email}</b><small>{emp.mobileNumber || "\u2014"}</small></span></td>
                    <td>{emp.mobileNumber || "\u2014"}</td>

                    <td>{emp.jobRole || "\u2014"}</td>
                    <td>{emp.department || "\u2014"}</td>
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
              {employeeList.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No employees registered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <AddEmployeeModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={fetchEmployees}
        branches={branches}
        departments={departments}
      />

      {rulesEmployee && (
        <EmployeeRulesModal
          open={true}
          employeeId={rulesEmployee.id}
          employeeName={rulesEmployee.name}
          onClose={() => setRulesEmployee(null)}
        />
      )}

      {/* Row click popup menu */}
      {menuEmployee && (() => {
        const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
        const menuW = 220, menuH = 150;
        const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const left = Math.min(menuEmployee.x, vw - menuW - 8);
        const top = menuEmployee.y + menuH > vh ? Math.max(8, menuEmployee.y - menuH) : menuEmployee.y;
        return (
          <>
            {/* Backdrop for mobile */}
            {isMobile && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,.4)",
                  zIndex: 999,
                }}
                onClick={() => setMenuEmployee(null)}
              />
            )}
            <div
              ref={menuRef}
              style={isMobile ? {
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                background: "#fff",
                borderRadius: "16px 16px 0 0",
                boxShadow: "0 -4px 30px rgba(0,0,0,.15)",
                zIndex: 1000,
                overflow: "hidden",
                paddingBottom: "env(safe-area-inset-bottom, 16px)",
              } : {
                position: "fixed",
                left,
                top,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 8px 30px rgba(0,0,0,.15)",
                border: "1px solid #e7e9ee",
                zIndex: 1000,
                minWidth: 200,
                overflow: "hidden",
              }}
            >
              {/* Mobile handle bar */}
              {isMobile && (
                <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: "#d1d5db" }} />
                </div>
              )}
              {/* Employee name header on mobile */}
              {isMobile && (
                <div style={{ padding: "8px 20px 12px", borderBottom: "1px solid #e7e9ee" }}>
                  <b style={{ fontSize: 15 }}>{menuEmployee.emp.name}</b>
                  <div style={{ fontSize: 12, color: "#8990a0" }}>{menuEmployee.emp.id}</div>
                </div>
              )}
              <button
                style={{ display: "block", width: "100%", padding: isMobile ? "16px 20px" : "14px 20px", background: "none", border: "none", textAlign: "left", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                onClick={() => { setDatewiseEmployee({ id: menuEmployee.emp.id, name: menuEmployee.emp.name }); setMenuEmployee(null); }}
              >
                Employee Datewise Status
              </button>
              <div style={{ height: 1, background: "#e7e9ee" }} />
              <button
                style={{ display: "block", width: "100%", padding: isMobile ? "16px 20px" : "14px 20px", background: "none", border: "none", textAlign: "left", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                onClick={() => { setDetailEmployee(menuEmployee.emp); setMenuEmployee(null); }}
              >
                Employee Detail
              </button>
              <div style={{ height: 1, background: "#e7e9ee" }} />
              <button
                style={{ display: "block", width: "100%", padding: isMobile ? "16px 20px" : "14px 20px", background: "none", border: "none", textAlign: "left", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                onClick={() => { setEditEmployee(menuEmployee.emp); setMenuEmployee(null); }}
              >
                Edit Employee
              </button>
            </div>
          </>
        );
      })()}

      {/* Datewise status modal */}
      {datewiseEmployee && (
        <StaffDatewiseModal
          employeeId={datewiseEmployee.id}
          employeeName={datewiseEmployee.name}
          onClose={() => setDatewiseEmployee(null)}
        />
      )}

      {/* Employee detail modal */}
      {detailEmployee && (
        <StaffDetailModal
          employee={detailEmployee}
          onClose={() => setDetailEmployee(null)}
        />
      )}

      {/* Edit employee modal */}
      {editEmployee && (
        <EditEmployeeModal
          employee={editEmployee}
          branches={branches}
          departments={departments}
          onClose={() => setEditEmployee(null)}
          onUpdated={fetchEmployees}
        />
      )}
    </>
  );
}
