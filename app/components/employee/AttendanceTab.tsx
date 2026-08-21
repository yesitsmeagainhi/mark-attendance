"use client";

import { useEffect, useState } from "react";
import { timeToMinutes, formatTimeIST, getIST, getGreeting, getGraceStatus } from "../../../lib/time-utils";
import type { UseAttendanceCameraReturn } from "../../hooks/useAttendanceCamera";

export default function AttendanceTab({ employeeId, displayName, camera }: { employeeId: string; displayName: string; camera: UseAttendanceCameraReturn }) {
  const {
    saving, photo, message,
    todayStatus,
    location, locationError, locationLoading, acquireLocation,
    nextPunchType, currentlyIn, elapsed, shiftDisplay,
    openCamera,
    geoAlert, dismissGeoAlert,
  } = camera;

  const [currentTime, setCurrentTime] = useState(getIST());
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(getIST()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hasPunchedIn = !!todayStatus?.punchIn;
  const punches = todayStatus?.punches || [];
  const dayComplete = (todayStatus?.nextPunchType ?? "IN") === null;
  const lastPunch = punches.length > 0 ? punches[punches.length - 1] : null;
  const hasPunchedOut = lastPunch?.type === "OUT" && hasPunchedIn;

  const expectedMinutes = todayStatus ? timeToMinutes(todayStatus.workEndTime) - timeToMinutes(todayStatus.workStartTime) : 0;
  let workedMinutes = 0;
  for (let i = 0; i < punches.length; i += 2) {
    if (punches[i]?.type !== "IN") break;
    const inDate = new Date(punches[i].time.replace(" ", "T") + (punches[i].time.includes("Z") ? "" : "Z"));
    if (punches[i + 1]?.type === "OUT") {
      const outDate = new Date(punches[i + 1].time.replace(" ", "T") + (punches[i + 1].time.includes("Z") ? "" : "Z"));
      workedMinutes += Math.floor((outDate.getTime() - inDate.getTime()) / 60000);
    } else {
      workedMinutes += Math.floor((Date.now() - inDate.getTime()) / 60000);
    }
  }
  const progressPct = expectedMinutes > 0 ? Math.min(100, Math.round((workedMinutes / expectedMinutes) * 100)) : 0;
  const gracePeriod = todayStatus?.rules?.gracePeriod ?? 15;
  const graceInfo = (todayStatus?.punchIn && !todayStatus.flexibleHours) ? getGraceStatus(todayStatus.punchIn.time, todayStatus.workStartTime, gracePeriod) : null;

  const ampm = currentTime.timeStr.includes("AM") || currentTime.timeStr.includes("am") ? "AM" : "PM";
  const timeOnly = currentTime.timeStr.replace(/(am|pm)/i, "").trim();

  return (
    <>
      <section className="hero-banner">
        <div className="hero-content">
          <p className="hero-date">{currentTime.dateStr}</p>
          <h1 className="hero-greeting">{getGreeting(currentTime.hours)}, {displayName.split(/\s+/)[0]}</h1>
          <p className="hero-sub">{dayComplete ? "Your workday is complete. See you tomorrow!" : currentlyIn ? "You're clocked in. Don't forget to punch out." : hasPunchedOut ? "On break. Punch back in when you return." : "Ready to start? Take a selfie to mark attendance."}</p>
        </div>
        <div className="hero-clock">
          <span className="hero-clock-time">{timeOnly}</span>
          <span className="hero-clock-ampm">{ampm}</span>
          <span className="hero-clock-zone">IST</span>
        </div>
      </section>

      <section className="status-strip">
        <article className={`status-chip ${hasPunchedIn ? "chip-done" : "chip-waiting"}`}>
          <span className="chip-icon">{hasPunchedIn ? "\u2713" : "\u2192"}</span>
          <div className="chip-info">
            <small>Punch In</small>
            {hasPunchedIn && todayStatus?.punchIn ? (
              <b>{formatTimeIST(todayStatus.punchIn.time)}</b>
            ) : (
              <b className="chip-pending">Pending</b>
            )}
          </div>
          {graceInfo && hasPunchedIn && <span className={`grace-badge ${graceInfo.className}`}>{graceInfo.label}</span>}
        </article>

        <article className={`status-chip ${dayComplete ? "chip-done" : currentlyIn ? "chip-active" : hasPunchedOut ? "chip-active" : "chip-waiting"}`}>
          <span className="chip-icon">{dayComplete ? "\u2713" : "\u2190"}</span>
          <div className="chip-info">
            <small>Punch Out</small>
            {todayStatus?.punchOut ? (
              <b>{formatTimeIST(todayStatus.punchOut.time)}</b>
            ) : (
              <b className="chip-pending">{currentlyIn ? "Awaiting" : "\u2014"}</b>
            )}
          </div>
          {dayComplete && <span className="grace-badge on-time">Done</span>}
          {hasPunchedOut && !dayComplete && <span className="grace-badge grace">Break</span>}
        </article>

        <article className={`status-chip chip-duration ${dayComplete ? "chip-done" : hasPunchedIn ? "chip-active" : "chip-waiting"}`}>
          <div className="chip-info" style={{ flex: 1 }}>
            <small>Duration</small>
            <b>{elapsed || "\u2014"}</b>
          </div>
          <div className="chip-progress">
            <div className="chip-progress-bar">
              <div className="chip-progress-fill" style={{ width: `${progressPct}%` }}></div>
            </div>
            <span className="chip-progress-label">{progressPct}%</span>
          </div>
        </article>
      </section>

      {!dayComplete && (
        <section className="punch-section">
          <article className="punch-compact-card">
            <div className={`camera-frame compact ${photo ? "has-photo" : ""}`}>
              {photo ? (
                <img src={photo} alt="Captured attendance selfie" />
              ) : (
                <div className="camera-empty">
                  <span className="camera-icon">&#9678;</span>
                  <p>Tap below to open camera</p>
                </div>
              )}
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            </div>

            <div className="punch-info-bar">
              <span>{todayStatus?.office || "\u2014"}</span>
              <span className="punch-info-sep">&middot;</span>
              <span>{shiftDisplay}</span>
              <span className="punch-info-sep">&middot;</span>
              {locationLoading && <span className="pending-text">GPS...</span>}
              {location && <span className="grace-badge on-time" style={{ fontSize: 11, padding: "1px 6px" }}>GPS {"\u00B1"}{Math.round(location.accuracy)}m</span>}
              {locationError && !locationLoading && (
                <button className="secondary" onClick={acquireLocation} style={{ padding: "2px 8px", fontSize: 11 }}>Enable GPS</button>
              )}
              {!location && !locationLoading && !locationError && (
                <button className="secondary" onClick={acquireLocation} style={{ padding: "2px 8px", fontSize: 11 }}>Enable GPS</button>
              )}
            </div>

            {currentlyIn && lastPunch && (
              <div className="punch-info-bar" style={{ fontSize: 12, color: "#6b7280" }}>
                <span>In: {formatTimeIST(lastPunch.time)}</span>
                {elapsed && <><span className="punch-info-sep">&middot;</span><span>{elapsed} elapsed</span></>}
              </div>
            )}

            <button
              className={`primary punch ${nextPunchType === "OUT" ? "punch-out-btn" : ""}`}
              onClick={openCamera}
              disabled={saving}
            >
              {photo ? "Retake" : nextPunchType === "IN" ? "Open Camera to Punch In" : "Open Camera to Punch Out"}
            </button>

            {locationError && !locationLoading && (
              <button className="secondary" onClick={acquireLocation} style={{ marginTop: 4, width: "100%", fontSize: 12 }}>Retry GPS</button>
            )}
            {message && <p className={`form-message ${!message.includes("Could not") && !message.includes("Waiting") && !message.includes("not within") ? "success-text" : ""}`} style={{ margin: "6px 0 0", fontSize: 13 }}>{message}</p>}
          </article>
        </section>
      )}

      {dayComplete && (
        <section className="day-complete-card">
          <div className="day-complete-icon">&#10003;</div>
          <h2>Workday complete</h2>
          <p>You punched in at <b>{todayStatus?.punchIn ? formatTimeIST(todayStatus.punchIn.time) : ""}</b> and out at <b>{todayStatus?.punchOut ? formatTimeIST(todayStatus.punchOut.time) : ""}</b>.</p>
          {punches.length > 2 && <p><small>{punches.length / 2} sessions today</small></p>}
          <p>Total hours: <b>{elapsed}</b> ({progressPct >= 100 ? "target met" : `${progressPct}% of target`})</p>
        </section>
      )}

      {punches.length > 0 && (
        <section className="punch-photos-row">
          <h3>Today&apos;s selfies</h3>
          <div className="punch-row" style={{ flexWrap: "wrap" }}>
            {punches.map((p, i) => (
              <div key={i} className="punch-thumb-wrap" style={{ marginBottom: 8 }}>
                {p.photoKey ? (
                  <img className="punch-thumb" src={`/api/attendance/photo?key=${encodeURIComponent(p.photoKey)}`} alt={p.type} style={{ cursor: "pointer" }} onClick={() => setViewPhoto(`/api/attendance/photo?key=${encodeURIComponent(p.photoKey!)}`)} />
                ) : (
                  <div className="punch-thumb empty-thumb" />
                )}
                <div className="punch-thumb-info">
                  <b>{p.type === "IN" ? "Punch In" : "Punch Out"}</b>
                  <span>{formatTimeIST(p.time)}</span>
                  <small>{p.office}</small>
                </div>
                {i < punches.length - 1 && <div className="punch-thumb-divider" />}
              </div>
            ))}
          </div>
        </section>
      )}

      {viewPhoto && (
        <div className="photo-overlay" onClick={() => setViewPhoto(null)}>
          <img src={viewPhoto} alt="Attendance selfie" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {geoAlert && (
        <div className="geo-alert-overlay" onClick={dismissGeoAlert}>
          <div className="geo-alert-card" onClick={(e) => e.stopPropagation()}>
            <div className="geo-alert-icon">&#9888;</div>
            <h3>Outside Office Range</h3>
            <p>You are <b>{geoAlert.distance >= 1000 ? `${(geoAlert.distance / 1000).toFixed(1)} km` : `${geoAlert.distance} m`}</b> away from <b>{geoAlert.branchName}</b>.</p>
            <p className="geo-alert-sub">Allowed range is <b>{geoAlert.allowedRadius} m</b>. Please move closer to mark attendance.</p>
            <button className="primary" onClick={dismissGeoAlert}>OK</button>
          </div>
        </div>
      )}
    </>
  );
}
