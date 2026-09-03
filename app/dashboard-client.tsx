"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

/* ── Action config for notification icon/color (mirrors HistoryTab) ── */
const NOTIF_CONFIG: Record<string, { icon: string; color: string }> = {
  admin_login:        { icon: "\u{1F511}", color: "#2563eb" },
  employee_login:     { icon: "\u{1F464}", color: "#3b82f6" },
  mark_present:       { icon: "\u2714",    color: "#059669" },
  mark_absent:        { icon: "\u2716",    color: "#dc2626" },
  mark_uh:            { icon: "\u{1F6AB}", color: "#7c3aed" },
  mark_all_present:   { icon: "\u2714\u2714", color: "#059669" },
  mark_all_uh:        { icon: "\u{1F6AB}", color: "#7c3aed" },
  undo_mark:          { icon: "\u21A9",    color: "#ea580c" },
  leave_request:      { icon: "\u{1F4CB}", color: "#0891b2" },
  leave_approved:     { icon: "\u2705",    color: "#059669" },
  leave_rejected:     { icon: "\u274C",    color: "#dc2626" },
  misspunch_request:  { icon: "\u23F0",    color: "#d97706" },
  misspunch_approved: { icon: "\u2705",    color: "#059669" },
  misspunch_rejected: { icon: "\u274C",    color: "#dc2626" },
};

type Toast = { id: string; actionType: string; icon: string; color: string; description: string; timestamp: string };

/* Map action types → admin tab they should navigate to */
const ACTION_TAB: Record<string, string> = {
  misspunch_request: "requests", misspunch_approved: "requests", misspunch_rejected: "requests",
  leave_request: "leaves", leave_approved: "leaves", leave_rejected: "leaves",
  mark_present: "dashboard", mark_absent: "dashboard", mark_uh: "dashboard",
  mark_all_present: "dashboard", mark_all_uh: "dashboard", undo_mark: "dashboard",
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Brand() {
  return <div className="brand"><span className="brandmark">A</span><span>Attendly</span></div>;
}

export default function DashboardClient({ view, employeeId, displayName, role }: { view: "employee" | "admin"; employeeId: string; displayName: string; role: "employee" | "admin" }) {
  const [activeTab, setActiveTabRaw] = useState("home");
  const [adminTab, setAdminTab] = useState("dashboard");
  const camera = useAttendanceCamera({ enabled: view === "employee" });

  // Wrap setActiveTab to push browser history so mobile back gesture returns to previous tab
  const setActiveTab = useCallback((tab: string) => {
    setActiveTabRaw(tab);
    if (tab !== "home") {
      window.history.pushState({ tab }, "", undefined);
    }
  }, []);

  // Listen for browser back button / swipe-back gesture
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      if (e.state?.tab) {
        setActiveTabRaw(e.state.tab);
      } else {
        setActiveTabRaw("home");
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ── Notification state (admin only) ──
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenTsRef = useRef<string | null>(null);
  const isFirstFetchRef = useRef(true);
  const queuedRef = useRef<Toast[]>([]); // events queued while tab is hidden

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

  // Show toasts and schedule their auto-removal after 5s
  const showToasts = useCallback((items: Toast[]) => {
    if (items.length === 0) return;
    setToasts(prev => [...items, ...prev].slice(0, 5));
    for (const t of items) {
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, 5000);
    }
  }, []);

  // ── Notification polling (admin only) ──
  const pollNotifications = useCallback(async () => {
    if (view !== "admin") return;
    try {
      const res = await fetch("/api/admin/activity-log?limit=5", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const activities: { id: string; actionType: string; description: string; timestamp: string }[] = data.activities || [];
      if (activities.length === 0) return;

      // Seed on first fetch — don't show toasts
      if (isFirstFetchRef.current) {
        isFirstFetchRef.current = false;
        lastSeenTsRef.current = activities[0].timestamp;
        return;
      }

      const lastSeen = lastSeenTsRef.current;
      const newEvents = lastSeen
        ? activities.filter(a => a.timestamp > lastSeen)
        : [];

      if (newEvents.length > 0) {
        lastSeenTsRef.current = activities[0].timestamp;
        const items: Toast[] = newEvents.map(a => ({
          id: a.id,
          actionType: a.actionType,
          icon: NOTIF_CONFIG[a.actionType]?.icon || "\u{1F514}",
          color: NOTIF_CONFIG[a.actionType]?.color || "#667085",
          description: a.description,
          timestamp: a.timestamp,
        }));
        setUnreadCount(prev => prev + newEvents.length);

        // If tab is hidden, queue them; otherwise show immediately
        if (document.hidden) {
          queuedRef.current = [...items, ...queuedRef.current].slice(0, 10);
        } else {
          showToasts(items);
        }
      }
    } catch {
      // ignore
    }
  }, [view, showToasts]);

  useEffect(() => {
    if (view !== "admin") return;
    pollNotifications();
    const id = setInterval(pollNotifications, 15000);
    return () => clearInterval(id);
  }, [view, pollNotifications]);

  // Flush queued notifications when tab becomes visible
  useEffect(() => {
    if (view !== "admin") return;
    function onVisible() {
      if (!document.hidden && queuedRef.current.length > 0) {
        showToasts(queuedRef.current);
        queuedRef.current = [];
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [view, showToasts]);

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
          {view === "admin" && (
            <button
              className="notif-bell"
              onClick={() => { setAdminTab("history"); setUnreadCount(0); }}
              aria-label="Notifications"
            >
              {"\u{1F514}"}
              {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
          )}
          {role === "admin" && (
            <a
              href={view === "admin" ? "/employee" : "/admin"}
              className="switch-view-btn"
            >
              {view === "admin" ? "My Attendance" : "Admin Panel"}
            </a>
          )}
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
              display: "flex", alignItems: "center",
              padding: "10px 16px", background: "#f6f7fb",
              borderBottom: "1px solid var(--line)",
            }}>
              <button
                type="button"
                onClick={() => setActiveTab("home")}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "none", border: "none", padding: "4px 8px",
                  cursor: "pointer", borderRadius: 8, fontSize: 16,
                  fontWeight: 600, color: "var(--ink)", fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>&larr;</span>
                Back to Home
              </button>
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
          withinGeoFence={camera.withinGeoFence}
          geoFenceInfo={camera.geoFenceInfo}
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
          {adminTab === "history" && <AdminHistoryTab onNavigate={setAdminTab} />}
          {adminTab === "settings" && <SettingsTab onSignOut={handleSignOut} />}
        </div>
      )}

      {/* ── Toast notifications (admin only) ── */}
      {view === "admin" && toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div
              key={t.id}
              className="toast-item toast-clickable"
              style={{ borderLeftColor: t.color }}
              onClick={() => {
                setAdminTab(ACTION_TAB[t.actionType] || "history");
                setToasts(prev => prev.filter(x => x.id !== t.id));
              }}
            >
              <span className="toast-icon">{t.icon}</span>
              <span className="toast-msg">{t.description}</span>
              <span className="toast-time">{timeAgo(t.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      <footer><span>&copy; 2026 Attendly</span><span>Privacy &middot; Support &middot; System status <i>&#9679; Operational</i></span></footer>
    </main>
  );
}
