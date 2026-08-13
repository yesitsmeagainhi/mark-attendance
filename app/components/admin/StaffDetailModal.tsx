"use client";

import type { EmployeeRow } from "./types";

export default function StaffDetailModal({ employee, onClose }: { employee: EmployeeRow; onClose: () => void }) {
  const initials = employee.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Employee Detail</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ padding: "24px 0 0" }}>
          <div className="profile-avatar">{initials}</div>
          <div className="profile-name">
            <h2>{employee.name}</h2>
            <p>{employee.jobRole || (employee.role === "admin" ? "Administrator" : "Employee")}</p>
          </div>

          <dl className="profile-grid">
            <div className="profile-field">
              <dt>Employee ID</dt>
              <dd>{employee.id}</dd>
            </div>
            <div className="profile-field">
              <dt>Email Address</dt>
              <dd>{employee.email}</dd>
            </div>
            <div className="profile-field">
              <dt>Mobile Number</dt>
              <dd>{employee.mobileNumber || "\u2014"}</dd>
            </div>
            <div className="profile-field">
              <dt>Job Role</dt>
              <dd>{employee.jobRole || "\u2014"}</dd>
            </div>
            <div className="profile-field">
              <dt>Office</dt>
              <dd>{employee.office}</dd>
            </div>
            <div className="profile-field">
              <dt>Work Shift</dt>
              <dd>
                {employee.workStartTime && employee.workEndTime
                  ? `${employee.workStartTime} \u2013 ${employee.workEndTime}`
                  : "No shift assigned"}
              </dd>
            </div>
            <div className="profile-field">
              <dt>Monthly Salary</dt>
              <dd>{employee.monthlySalary > 0 ? `\u20B9${employee.monthlySalary.toLocaleString("en-IN")}` : "\u2014"}</dd>
            </div>
            <div className="profile-field">
              <dt>Status</dt>
              <dd><span className={`status ${employee.active ? "" : "absent"}`}>&#9679; {employee.active ? "Active" : "Inactive"}</span></dd>
            </div>
            <div className="profile-field">
              <dt>Date Joined</dt>
              <dd>{new Date(employee.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</dd>
            </div>
            <div className="profile-field">
              <dt>Role</dt>
              <dd>{employee.role === "admin" ? "Administrator" : "Employee"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
