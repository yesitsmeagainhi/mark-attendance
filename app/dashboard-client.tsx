"use client";

import { useState, useEffect } from "react";
import TabNavigation from "./components/employee/TabNavigation";
import HomeTab from "./components/employee/HomeTab";
import AttendanceTab from "./components/employee/AttendanceTab";
import FullscreenCameraOverlay from "./components/employee/FullscreenCameraOverlay";
import { useAttendanceCamera } from "./hooks/useAttendanceCamera";
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
  const [activeTab, setActiveTab] = useState("home");
  const [adminTab, setAdminTab] = useState("dashboard");
  const camera = useAttendanceCamera({ enabled: view === "employee" });

  // Session heartbeat: detect if session was invalidated (e.g. logged in on another device)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/auth/session-check", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = view === "admin" ? "/login?mode=admin" : "/login?mode=employee";
        }
      } catch {
        // Network error — ignore, will retry on next interval
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [view]);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <main>
      <header className="topbar">
        <Brand />
        <nav><span className="portal-label">{view === "admin" ? "Admin" : "Employee"}</span></nav>
        <div className="user">
          <span className="avatar">{displayName.slice(0, 2).toUpperCase()}</span>
          <span><b>{displayName}</b><small>{role === "admin" ? "Administrator" : employeeId}</small></span>
          <button className="signout" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      {view === "employee" ? (
        // <div className="employee-layout">
<div className={`employee-layout ${camera.cameraOpen ? "camera-active" : ""}`}>

          {/* <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} /> */}
          {/* {!camera.cameraOpen && (
            <TabNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          )} */}
          {/* Back bar for sub-screens navigated from Home */}
          {!["home", "attendance"].includes(activeTab) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 16px", background: "#f6f7fb",
              borderBottom: "1px solid var(--line)", cursor: "pointer",
            }} onClick={() => setActiveTab("home")}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>&larr;</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Back to Home</span>
            </div>
          )}

          {activeTab === "home" && <HomeTab displayName={displayName} onNavigate={setActiveTab} onOpenCamera={camera.openCamera} todayStatus={camera.todayStatus} />}
          {activeTab === "attendance" && <AttendanceTab employeeId={employeeId} displayName={displayName} camera={camera} />}
          {activeTab === "miss-punch" && <MissPunchTab />}
          {activeTab === "leave" && <LeaveTab />}
          {activeTab === "history" && <HistoryTab />}
          {activeTab === "timesheet" && <TimesheetTab />}
          {activeTab === "profile" && <ProfileTab onSignOut={handleSignOut} />}
        </div>
      ) : null}

      {view === "employee" && camera.cameraOpen && (
        <FullscreenCameraOverlay
          modelsLoaded={camera.modelsLoaded}
          modelError={camera.modelError}
          faceStatus={camera.faceStatus}
          faceGuidance={camera.faceGuidance}
          nextPunchType={(camera.nextPunchType ?? "IN") as "IN" | "OUT"}
          officeName={camera.todayStatus?.office || ""}
          shiftDisplay={camera.shiftDisplay}
          location={camera.location}
          locationLoading={camera.locationLoading}
          locationError={camera.locationError}
          currentlyIn={camera.currentlyIn}
          lastPunchTime={camera.lastPunchTime}
          elapsed={camera.elapsed}
          onCaptureFrame={camera.handleCaptureFrame}
          onClose={camera.closeCamera}
          onRetryGPS={camera.acquireLocation}
          onFaceUpdate={camera.setFaceUpdate}
          saving={camera.saving}
        />
      )}

      {view === "admin" && (
        <div className="admin-layout">
          <AdminTabNavigation activeTab={adminTab} onTabChange={setAdminTab} />

          {adminTab === "dashboard" && <DashboardTab />}
          {adminTab === "staff" && <StaffTab />}
          {adminTab === "requests" && <RequestsTab />}
          {adminTab === "leaves" && <LeavesTab />}
          {adminTab === "reports" && <ReportsTab />}
          {/* {adminTab === "payroll" && <PayrollTab />} */}
          {adminTab === "history" && <AdminHistoryTab />}
          {adminTab === "settings" && <SettingsTab onSignOut={handleSignOut} />}
        </div>
      )}
      <footer><span>&copy; 2026 Attendly</span><span>Privacy &middot; Support &middot; System status <i>&#9679; Operational</i></span></footer>
    </main>
  );
}
