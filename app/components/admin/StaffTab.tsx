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
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [search, setSearch] = useState("");
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

  async function toggleActive(emp: EmployeeRow) {
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id, active: !emp.active }),
    });
    setMenuEmployee(null);
    fetchEmployees();
  }

  async function deleteEmployee(emp: EmployeeRow) {
    if (!confirm(`Are you sure you want to permanently delete ${emp.name}? This will remove all their attendance records, leave requests, and other data. This action cannot be undone.`)) return;
    const res = await fetch("/api/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "Failed to delete employee.");
    }
    setMenuEmployee(null);
    fetchEmployees();
  }

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

  function exportEmployees() {
    if (employeeList.length === 0) return;
    const headers = ["ID", "Name", "Email", "Mobile Number", "Job Role", "Department", "Work Start", "Work End", "Office", "Monthly Salary", "Status", "Added On"];
    const rows = employeeList.map((emp) => [
      emp.id,
      emp.name,
      emp.email,
      emp.mobileNumber || "",
      emp.jobRole || "",
      emp.department || "",
      emp.workStartTime || "",
      emp.workEndTime || "",
      emp.office || "",
      String(emp.monthlySalary || 0),
      emp.active ? "Active" : "Inactive",
      new Date(emp.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="table-card">
        <div className="table-tools">
          <div><h2>Registered employees</h2><p>{employeeList.length} total</p></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID or email"
              aria-label="Search employees"
              style={{ minWidth: 180, padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 9, fontSize: 13, outline: "none" }}
            />
            <button className="secondary" style={{ width: "auto", fontSize: 13, padding: "6px 14px" }} onClick={exportEmployees} disabled={employeeList.length === 0}>Export</button>
            <button className="secondary" style={{ width: "auto", fontSize: 13, padding: "6px 14px" }} onClick={() => setShowBulkModal(true)}>Import</button>
            <button className="primary" style={{ width: "auto", fontSize: 13, padding: "6px 14px" }} onClick={() => setShowAddModal(true)}>+ Add employee</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Contact</th><th>Job role</th><th>Department</th><th>Work hours</th><th>Office</th><th>Salary</th><th>Rules</th><th>Status</th><th>Added</th></tr></thead>
            <tbody>
              {employeeList.filter((emp) => {
                if (!search.trim()) return true;
                const q = search.trim().toLowerCase();
                return `${emp.name} ${emp.id} ${emp.email} ${emp.mobileNumber || ""}`.toLowerCase().includes(q);
              }).map((emp) => {
                const initials = emp.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                const color = ["#7c3aed", "#2563eb", "#059669", "#db2777", "#ea580c"][emp.id.charCodeAt(emp.id.length - 1) % 5];
                return (
                  <tr key={emp.id} style={{ cursor: "pointer" }} onClick={(e) => {
                    // Don't open menu if clicking salary edit or rules button
                    if ((e.target as HTMLElement).closest("input, button")) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuEmployee({ emp, x: e.clientX, y: rect.bottom });
                  }}>
                    <td className="cell-flex"><span className="person" style={{ background: color }}>{initials}</span><span><b>{emp.name}</b>{emp.flexibleHours && <span style={{ fontSize: 10, background: "#ede9fe", color: "#7c3aed", padding: "1px 6px", borderRadius: 6, marginLeft: 6, fontWeight: 600 }}>Flex</span>}<small>{emp.id}</small></span></td>
                    <td className="cell-flex"><span><b>{emp.email}</b><small>{emp.mobileNumber || "\u2014"}</small></span></td>
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
        const menuW = 240, menuH = 260;
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
              <div style={{ height: 1, background: "#e7e9ee" }} />
              <button
                style={{ display: "block", width: "100%", padding: isMobile ? "16px 20px" : "14px 20px", background: "none", border: "none", textAlign: "left", fontSize: 14, fontWeight: 600, cursor: "pointer", color: menuEmployee.emp.active ? "#a86400" : "#168052" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                onClick={() => toggleActive(menuEmployee.emp)}
              >
                {menuEmployee.emp.active ? "Deactivate Employee" : "Activate Employee"}
              </button>
              <div style={{ height: 1, background: "#e7e9ee" }} />
              <button
                style={{ display: "block", width: "100%", padding: isMobile ? "16px 20px" : "14px 20px", background: "none", border: "none", textAlign: "left", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#c73333" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fff5f5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                onClick={() => deleteEmployee(menuEmployee.emp)}
              >
                Delete Employee
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

      {/* Bulk import modal */}
      {showBulkModal && (
        <BulkImportModal
          onClose={() => setShowBulkModal(false)}
          onImported={fetchEmployees}
        />
      )}
    </>
  );
}

/* ── Bulk Import Modal (CSV + XLSX) ────────────────────────── */

const CSV_HEADERS = ["name", "email", "password", "jobRole", "department", "mobileNumber", "workStartTime", "workEndTime", "office", "monthlySalary"] as const;

type ParsedRow = Record<string, string>;

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const row: ParsedRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function downloadTemplate() {
  const header = CSV_HEADERS.join(",");
  const example = "John Doe,john@company.com,pass1234,Counsellor,HR,9876543210,09:00,18:00,Bhayandar Office,25000";
  const blob = new Blob([header + "\n" + example + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "employee_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type ImportError = { row: number; field: string; message: string };
type ImportResult = { created: { id: string; name: string; email: string }[]; errors: ImportError[] };

function BulkImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isXlsx, setIsXlsx] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);
    setSelectedFile(file);

    const ext = file.name.toLowerCase();
    if (ext.endsWith(".xlsx")) {
      // XLSX files are parsed server-side; show file name only
      setIsXlsx(true);
      setRows([]);
    } else if (ext.endsWith(".csv")) {
      setIsXlsx(false);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          setError("No data rows found. Make sure the file has a header row and at least one data row.");
          setRows([]);
          return;
        }
        setRows(parsed);
      };
      reader.readAsText(file);
    } else {
      setError("Unsupported file format. Please upload a .csv or .xlsx file.");
      setSelectedFile(null);
      setRows([]);
    }
  }

  async function handleImport() {
    setImporting(true);
    setError("");
    try {
      let res: Response;
      if (isXlsx && selectedFile) {
        // Send XLSX as FormData for server-side parsing
        const formData = new FormData();
        formData.append("file", selectedFile);
        res = await fetch("/api/employees/bulk", { method: "POST", body: formData });
      } else {
        // Send parsed CSV rows as JSON
        const payload = rows.map((r) => ({
          name: r.name || "",
          email: r.email || "",
          password: r.password || "",
          jobRole: r.jobRole || "",
          department: r.department || "",
          mobileNumber: r.mobileNumber || "",
          workStartTime: r.workStartTime || "",
          workEndTime: r.workEndTime || "",
          office: r.office || "",
          monthlySalary: r.monthlySalary ? Number(r.monthlySalary) : 0,
        }));
        res = await fetch("/api/employees/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employees: payload }),
        });
      }
      const data = await res.json() as ImportResult & { error?: string };
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        if (data.created.length > 0) onImported();
      }
    } catch {
      setError("Could not connect to server.");
    } finally {
      setImporting(false);
    }
  }

  const canImport = isXlsx ? !!selectedFile : rows.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h2>Import employees</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-form" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!result && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                Upload a <b>.csv</b> or <b>.xlsx</b> file with employee details. Required columns: <b>name</b>, <b>email</b>, <b>password</b>. Optional: jobRole, department, mobileNumber, workStartTime, workEndTime, office, monthlySalary.
              </p>
              <button type="button" className="secondary" onClick={downloadTemplate} style={{ alignSelf: "flex-start", fontSize: 13 }}>
                Download CSV template
              </button>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Choose file (.csv or .xlsx)</span>
                <input type="file" accept=".csv,.xlsx" onChange={handleFile} />
              </label>

              {/* CSV preview */}
              {fileName && !isXlsx && rows.length > 0 && (
                <>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    <b>{rows.length}</b> employee{rows.length !== 1 ? "s" : ""} found in <b>{fileName}</b>
                  </p>
                  <div style={{ maxHeight: 250, overflow: "auto", border: "1px solid #e7e9ee", borderRadius: 8 }}>
                    <table style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "6px 10px" }}>#</th>
                          <th style={{ padding: "6px 10px" }}>Name</th>
                          <th style={{ padding: "6px 10px" }}>Email</th>
                          <th style={{ padding: "6px 10px" }}>Job Role</th>
                          <th style={{ padding: "6px 10px" }}>Dept</th>
                          <th style={{ padding: "6px 10px" }}>Mobile</th>
                          <th style={{ padding: "6px 10px" }}>Office</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td style={{ padding: "4px 10px" }}>{i + 1}</td>
                            <td style={{ padding: "4px 10px" }}>{r.name || <span style={{ color: "#e53e3e" }}>missing</span>}</td>
                            <td style={{ padding: "4px 10px" }}>{r.email || <span style={{ color: "#e53e3e" }}>missing</span>}</td>
                            <td style={{ padding: "4px 10px" }}>{r.jobRole || "\u2014"}</td>
                            <td style={{ padding: "4px 10px" }}>{r.department || "\u2014"}</td>
                            <td style={{ padding: "4px 10px" }}>{r.mobileNumber || "\u2014"}</td>
                            <td style={{ padding: "4px 10px" }}>{r.office || "\u2014"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* XLSX file selected indicator */}
              {fileName && isXlsx && (
                <p style={{ margin: 0, fontSize: 13 }}>
                  Selected: <b>{fileName}</b> (Excel file &mdash; will be parsed on import)
                </p>
              )}

              {error && <p className="form-message">{error}</p>}
              <button
                className="primary"
                onClick={handleImport}
                disabled={importing || !canImport}
                style={{ fontSize: 14 }}
              >
                {importing ? "Importing..." : isXlsx ? "Import from Excel" : `Import ${rows.length} employee${rows.length !== 1 ? "s" : ""}`}
              </button>
            </>
          )}

          {result && (
            <>
              {result.created.length > 0 && (
                <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                  <b style={{ color: "#166534" }}>{result.created.length} employee{result.created.length !== 1 ? "s" : ""} imported successfully</b>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13 }}>
                    {result.created.map((c) => (
                      <li key={c.id}>{c.name} ({c.id}) &mdash; {c.email}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.errors.length > 0 && (
                <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                  <b style={{ color: "#991b1b" }}>{result.errors.length} error{result.errors.length !== 1 ? "s" : ""}</b>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13 }}>
                    {result.errors.map((err, i) => (
                      <li key={i} style={{ color: "#991b1b" }}>Row {err.row}: {err.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button className="primary" onClick={onClose} style={{ fontSize: 14 }}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
