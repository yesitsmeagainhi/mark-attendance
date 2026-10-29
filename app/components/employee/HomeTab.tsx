"use client";

import { useEffect, useState } from "react";
import { getIST, getGreeting, formatTimeIST, getGraceStatus, formatDuration } from "../../../lib/time-utils";
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
  const [upcomingHolidays, setUpcomingHolidays] = useState<{ date: string; name: string; paid: boolean }[]>([]);

  useEffect(() => {
    fetch("/api/attendance/holidays")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.holidays) setUpcomingHolidays(d.holidays); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setCurrentTime(getIST());
    const t = setInterval(() => setCurrentTime(getIST()), 1000);
    return () => clearInterval(t);
  }, []);

  const greeting = currentTime ? getGreeting(currentTime.hours) : "";
  const dateStr = currentTime?.dateStr ?? "";
  const timeStr = currentTime?.timeStr ?? "";

  const isFlexible = todayStatus?.flexibleHours === true;
  const punches = todayStatus?.punches ?? [];

  // Build lecture sessions from IN→OUT pairs
  const sessions: { inTime: string; outTime: string | null }[] = [];
  for (let i = 0; i < punches.length; i++) {
    if (punches[i].type === "IN") {
      const out = punches[i + 1]?.type === "OUT" ? punches[i + 1].time : null;
      sessions.push({ inTime: punches[i].time, outTime: out });
      if (out) i++; // skip the paired OUT
    }
  }

  // Total minutes worked today (completed sessions only)
  let totalMinutesToday = 0;
  for (const s of sessions) {
    if (s.outTime) {
      const inMs = new Date(s.inTime.replace(" ", "T") + (s.inTime.includes("Z") ? "" : "Z")).getTime();
      const outMs = new Date(s.outTime.replace(" ", "T") + (s.outTime.includes("Z") ? "" : "Z")).getTime();
      totalMinutesToday += Math.max(0, Math.floor((outMs - inMs) / 60000));
    }
  }

  const currentlyInLecture = sessions.length > 0 && sessions[sessions.length - 1].outTime === null;

  const punchedIn = !!todayStatus?.punchIn;
  const punchedOut = !!todayStatus?.punchOut;
  const dayComplete = !isFlexible && punchedIn && punchedOut && !todayStatus?.canPunchOut;

  let statusText = isFlexible ? "No lectures today" : "You haven\u2019t punched in yet";
  let statusColor = "#ea580c";
  if (isFlexible) {
    if (currentlyInLecture) {
      statusText = "Lecture in progress";
      statusColor = "#2563eb";
    } else if (sessions.length > 0) {
      statusText = `${sessions.length} lecture${sessions.length > 1 ? "s" : ""} today \u00b7 ${formatDuration(totalMinutesToday)}`;
      statusColor = "#059669";
    }
  } else if (dayComplete) {
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
  if (!isFlexible && todayStatus?.punchIn && todayStatus.workStartTime) {
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
        <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 4 }}>{dateStr}</div>
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
          <span style={{ fontSize: 16, fontWeight: 700, color: statusColor }}>{statusText}</span>
          {graceLabel && (
            <span style={{
              fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              background: graceLabel === "On time" ? "#e8f7ef" : graceLabel === "Grace" ? "#fff4dc" : "#ffeded",
              color: graceLabel === "On time" ? "#168052" : graceLabel === "Grace" ? "#a86400" : "#c73333",
              marginLeft: "auto",
            }}>{graceLabel}</span>
          )}
        </div>
        {isFlexible ? (
          <div style={{ marginBottom: 4 }}>
            {sessions.length === 0 ? (
              <div style={{ background: "#f6f7fb", borderRadius: 10, padding: "10px 14px", color: "var(--muted)", fontSize: 15 }}>
                No lectures recorded yet today.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sessions.map((s, i) => {
                  const dur = s.outTime ? (() => {
                    const inMs = new Date(s.inTime.replace(" ", "T") + (s.inTime.includes("Z") ? "" : "Z")).getTime();
                    const outMs = new Date(s.outTime!.replace(" ", "T") + (s.outTime!.includes("Z") ? "" : "Z")).getTime();
                    return formatDuration(Math.max(0, Math.floor((outMs - inMs) / 60000)));
                  })() : null;
                  return (
                    <div key={i} style={{ background: "#f6f7fb", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", minWidth: 68 }}>Lecture {i + 1}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
                        {formatTimeIST(s.inTime)} &ndash; {s.outTime ? formatTimeIST(s.outTime) : <span style={{ color: "#2563eb" }}>ongoing</span>}
                      </span>
                      {dur && <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--muted)" }}>{dur}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, background: "#f6f7fb", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Punch In</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                {todayStatus?.punchIn ? formatTimeIST(todayStatus.punchIn.time) : "\u2014"}
              </div>
            </div>
            <div style={{ flex: 1, background: "#f6f7fb", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Punch Out</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                {todayStatus?.punchOut ? formatTimeIST(todayStatus.punchOut.time) : "\u2014"}
              </div>
            </div>
          </div>
        )}
        {(isFlexible || !dayComplete) && (
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
              fontSize: 17,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}
          >
            {isFlexible
              ? (currentlyInLecture ? "\u{1F4F7} End Lecture" : "\u{1F4F7} Start Lecture")
              : (punchedIn ? "\u{1F4F7} Punch Out" : "\u{1F4F7} Mark Attendance")}
          </button>
        )}
      </div>

      {/* Upcoming holidays */}
      {upcomingHolidays.length > 0 && (
        <div style={{
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "14px 18px",
          marginBottom: 24,
          boxShadow: "0 2px 8px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>
            &#127881; Upcoming {upcomingHolidays[0].paid ? "paid " : ""}holidays
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcomingHolidays.map((h) => (
              <div key={h.date} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
                <span style={{ minWidth: 92, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                  {new Date(`${h.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}
                </span>
                <span style={{ flex: 1, fontWeight: 600, color: "var(--ink)" }}>{h.name}</span>
                {h.paid && (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#e8f7ef", color: "#168052" }}>Paid</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
            <span style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.label}</span>
            <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>{item.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
