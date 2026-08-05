"use client";

import { useState } from "react";
import TabNavigation from "./components/employee/TabNavigation";
import AttendanceTab from "./components/employee/AttendanceTab";
import MissPunchTab from "./components/employee/MissPunchTab";
import LeaveTab from "./components/employee/LeaveTab";
import HistoryTab from "./components/employee/HistoryTab";
import TimesheetTab from "./components/employee/TimesheetTab";
import ProfileTab from "./components/employee/ProfileTab";
import AdminTabNavigation from "./components/admin/AdminTabNavigation";
import DashboardTab from "./components/admin/DashboardTab";
import StaffTab from "./components/admin/StaffTab";
import RequestsTab from "./components/admin/RequestsTab";
import LeavesTab from "./components/admin/LeavesTab";
import ReportsTab from "./components/admin/ReportsTab";
import PayrollTab from "./components/admin/PayrollTab";
import AdminHistoryTab from "./components/admin/HistoryTab";
import SettingsTab from "./components/admin/SettingsTab";

function Brand() {
  return <div className="brand"><span className="brandmark">A</span><span>Attendly</span></div>;
}

export default function DashboardClient({ view, employeeId, displayName, role }: { view: "employee" | "admin"; employeeId: string; displayName: string; role: "employee" | "admin" }) {
  const [activeTab, setActiveTab] = useState("attendance");
  const [adminTab, setAdminTab] = useState("dashboard");

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <main>
      <header className="topbar">
        <Brand />
        <nav><span className="portal-label">{view === "admin" ? "Admin portal" : "Employee portal"}</span></nav>
        <div className="user">
          <span className="avatar">{displayName.slice(0, 2).toUpperCase()}</span>
          <span><b>{displayName}</b><small>{role === "admin" ? "Administrator" : employeeId}</small></span>
          <button className="signout" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      {view === "employee" ? (
        <div className="employee-layout">
          <div className="mobile-signout-bar">
            <span className="avatar">{displayName.slice(0, 2).toUpperCase()}</span>
            <span><b>{displayName}</b><small>{employeeId}</small></span>
            <button className="signout" onClick={handleSignOut}>Sign out</button>
          </div>

          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === "attendance" && <AttendanceTab employeeId={employeeId} displayName={displayName} />}
          {activeTab === "miss-punch" && <MissPunchTab />}
          {activeTab === "leave" && <LeaveTab />}
          {activeTab === "history" && <HistoryTab />}
          {activeTab === "timesheet" && <TimesheetTab />}
          {activeTab === "profile" && <ProfileTab />}
        </div>
      ) : (
        <div className="admin-layout">
          <AdminTabNavigation activeTab={adminTab} onTabChange={setAdminTab} />

          {adminTab === "dashboard" && <DashboardTab />}
          {adminTab === "staff" && <StaffTab />}
          {adminTab === "requests" && <RequestsTab />}
          {adminTab === "leaves" && <LeavesTab />}
          {adminTab === "reports" && <ReportsTab />}
          {adminTab === "payroll" && <PayrollTab />}
          {adminTab === "history" && <AdminHistoryTab />}
          {adminTab === "settings" && <SettingsTab />}
        </div>
      )}
      <footer><span>&copy; 2026 Attendly</span><span>Privacy &middot; Support &middot; System status <i>&#9679; Operational</i></span></footer>
    </main>
  );
}
