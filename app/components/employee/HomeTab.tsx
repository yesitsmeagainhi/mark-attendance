"use client";

import { useEffect, useState } from "react";
import { getIST, getGreeting, formatTimeIST, getGraceStatus } from "../../../lib/time-utils";
import type { TodayStatus } from "./attendance-types";

const menuItems = [
  { id: "miss-punch", icon: "\u{1F514}", label: "Miss Punch", desc: "Request correction for missed punches", color: "#ea580c", bg: "#fff7ed" },
  { id: "leave", icon: "\u{1F4C5}", label: "Leave", desc: "Apply for casual, sick, or earned leave", color: "#2563eb", bg: "#eff6ff" },
  { id: "history", icon: "\u{1F4CB}", label: "History", desc: "View your attendance records", color: "#059669", bg: "#ecfdf5" },
  { id: "timesheet", icon: "\u{1F552}", label: "Journal", desc: "Log daily tasks and to-do list", color: "#7c3aed", bg: "#f5f3ff" },
  { id: "profile", icon: "\u{1F464}", label: "Profile", desc: "Your profile & account info", color: "#64748b", bg: "#f8fafc" },
];

export default function HomeTab({ displayName, onNavigate, onOpenCamera, todayStatus }: { displayName: string; onNavigate: (tab: string) => void; onOpenCamera: () => void; todayStatus: TodayStatus | null }) {
  const [currentTime, setCurrentTime] = useState<ReturnType<typeof getIST> | null>(null);

  useEffect(() => {
    setCurrentTime(getIST());
    const t = setInterval(() => setCurrentTime(getIST()), 1000);
    return () => clearInterval(t);
  }, []);

  const greeting = currentTime ? getGreeting(currentTime.hours) : "";
  const dateStr = currentTime?.dateStr ?? "";
  const timeStr = currentTime?.timeStr ?? "";

  const punchedIn = !!todayStatus?.punchIn;
  const punchedOut = !!todayStatus?.punchOut;
  const dayComplete = punchedIn && punchedOut && !todayStatus?.canPunchOut;

  let statusText = "You haven\u2019t punched in yet";
  let statusColor = "#ea580c";
  if (dayComplete) {
    statusText = "Day complete \u2014 Great work!";
    statusColor = "#059669";
  } else if (punchedIn && !punchedOut) {
    statusText = "You\u2019re clocked in";
    statusColor = "#2563eb";
  } else if (punchedIn) {
    statusText = "Punched in today";
    statusColor = "#059669";
  }

  let graceLabel = "";
  if (todayStatus?.punchIn && todayStatus.workStartTime) {
    const g = getGraceStatus(todayStatus.punchIn.time, todayStatus.workStartTime, todayStatus.rules?.gracePeriod ?? 0);
    graceLabel = g.label;
  }

  return (
    <div style={{ padding: "20px 16px 100px", maxWidth: 480, margin: "0 auto" }}>
      {/* Greeting */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em" }}>
          {greeting}, {displayName.split(" ")[0]}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{dateStr}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--purple)", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
      </div>

      {/* Today's Status Card */}
      <div style={{
        background: "#fff",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "18px 18px 14px",
        marginBottom: 24,
        boxShadow: "0 2px 8px rgba(0,0,0,.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: statusColor,
            display: "inline-block",
            boxShadow: `0 0 0 3px ${statusColor}22`,
          }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: statusColor }}>{statusText}</span>
          {graceLabel && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              background: graceLabel === "On time" ? "#e8f7ef" : graceLabel === "Grace" ? "#fff4dc" : "#ffeded",
              color: graceLabel === "On time" ? "#168052" : graceLabel === "Grace" ? "#a86400" : "#c73333",
              marginLeft: "auto",
            }}>{graceLabel}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, background: "#f6f7fb", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Punch In</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
              {todayStatus?.punchIn ? formatTimeIST(todayStatus.punchIn.time) : "\u2014"}
            </div>
          </div>
          <div style={{ flex: 1, background: "#f6f7fb", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Punch Out</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
              {todayStatus?.punchOut ? formatTimeIST(todayStatus.punchOut.time) : "\u2014"}
            </div>
          </div>
        </div>
        {!dayComplete && (
          <button
            onClick={onOpenCamera}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "13px 0",
              background: "var(--purple)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}
            
          >
            {punchedIn ? "\u{1F4F7} Punch Out" : "\u{1F4F7} Mark Attendance"}
          </button>
        )}
      </div>

      {/* Menu Blocks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              padding: "16px 14px",
              background: item.bg,
              border: `1px solid ${item.color}18`,
              borderRadius: 14,
              cursor: "pointer",
              textAlign: "left",
              transition: "transform .1s, box-shadow .1s",
            }}
          >
            <span style={{ fontSize: 26 }}>{item.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.label}</span>
            <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.35 }}>{item.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
