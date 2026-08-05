"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { timeToMinutes, formatDuration, formatTimeIST, getIST, getGreeting, getGraceStatus } from "../../../lib/time-utils";

type TodayStatus = {
  workStartTime: string;
  workEndTime: string;
  office: string;
  punchIn: { time: string; office: string; photoKey?: string } | null;
  punchOut: { time: string; office: string; photoKey?: string } | null;
};

export default function AttendanceTab({ employeeId, displayName }: { employeeId: string; displayName: string }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [currentTime, setCurrentTime] = useState(getIST());
  const [elapsed, setElapsed] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // GPS location state
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch("/api/attendance/status")
      .then((r) => r.ok ? r.json() : null)
      .then((data: TodayStatus | null) => {
        if (data) setTodayStatus(data);
      })
      .catch(() => undefined);
  }, []);

  // GPS acquisition
  const acquireLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Your browser does not support GPS location.");
      return;
    }
    setLocationLoading(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationLoading(false);
      },
      (err) => {
        setLocationLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError("Location permission denied. Please enable location access in your browser settings and refresh.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationError("Location unavailable. Please check that GPS is enabled on your device.");
        } else if (err.code === err.TIMEOUT) {
          setLocationError("Location request timed out. Please try again in an open area.");
        } else {
          setLocationError("Could not determine your location. Please try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  // Auto-acquire GPS on mount (when day is not complete)
  useEffect(() => {
    acquireLocation();
  }, [acquireLocation]);

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(getIST()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Elapsed duration
  useEffect(() => {
    if (!todayStatus?.punchIn) { setElapsed(""); return; }
    if (todayStatus.punchOut) {
      const inDate = new Date(todayStatus.punchIn.time.replace(" ", "T") + (todayStatus.punchIn.time.includes("Z") ? "" : "Z"));
      const outDate = new Date(todayStatus.punchOut.time.replace(" ", "T") + (todayStatus.punchOut.time.includes("Z") ? "" : "Z"));
      setElapsed(formatDuration(Math.max(0, Math.floor((outDate.getTime() - inDate.getTime()) / 60000))));
      return;
    }
    function update() {
      if (!todayStatus?.punchIn) return;
      const inDate = new Date(todayStatus.punchIn.time.replace(" ", "T") + (todayStatus.punchIn.time.includes("Z") ? "" : "Z"));
      setElapsed(formatDuration(Math.max(0, Math.floor((Date.now() - inDate.getTime()) / 60000))));
    }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [todayStatus]);

  // Fetch status on mount
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Camera
  useEffect(() => {
    if (!cameraOpen) return;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraOpen(false));
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [cameraOpen]);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    // Cap resolution to 480px max dimension to keep file sizes small (~30-50KB)
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 720;
    const scale = Math.min(1, 480 / Math.max(vw, vh));
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", .60));
    setCameraOpen(false);
  }

  const hasPunchedIn = !!todayStatus?.punchIn;
  const hasPunchedOut = !!todayStatus?.punchOut;
  const dayComplete = hasPunchedIn && hasPunchedOut;
  const nextPunchType = hasPunchedIn && !hasPunchedOut ? "OUT" : "IN";

  async function submitPunch() {
    if (!photo) return setCameraOpen(true);
    if (!location) {
      setMessage("Waiting for GPS location. Please allow location access and try again.");
      acquireLocation();
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const blob = await (await fetch(photo)).blob();
      const form = new FormData();
      form.append("photo", blob, "selfie.jpg");
      form.append("punchType", nextPunchType);
      form.append("office", todayStatus?.office || "");
      form.append("latitude", location.latitude.toString());
      form.append("longitude", location.longitude.toString());
      const response = await fetch("/api/attendance", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not mark attendance.");
      setMessage(nextPunchType === "IN" ? "Punch in recorded successfully." : "Punch out recorded. Have a great evening!");
      setPhoto(null);
      setLocation(null);
      acquireLocation(); // re-acquire for next punch
      fetchStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark attendance.");
    } finally {
      setSaving(false);
    }
  }

  const expectedMinutes = todayStatus ? timeToMinutes(todayStatus.workEndTime) - timeToMinutes(todayStatus.workStartTime) : 0;
  let workedMinutes = 0;
  if (todayStatus?.punchIn) {
    const inDate = new Date(todayStatus.punchIn.time.replace(" ", "T") + (todayStatus.punchIn.time.includes("Z") ? "" : "Z"));
    if (todayStatus.punchOut) {
      const outDate = new Date(todayStatus.punchOut.time.replace(" ", "T") + (todayStatus.punchOut.time.includes("Z") ? "" : "Z"));
      workedMinutes = Math.floor((outDate.getTime() - inDate.getTime()) / 60000);
    } else {
      workedMinutes = Math.floor((Date.now() - inDate.getTime()) / 60000);
    }
  }
  const progressPct = expectedMinutes > 0 ? Math.min(100, Math.round((workedMinutes / expectedMinutes) * 100)) : 0;
  const graceInfo = todayStatus?.punchIn ? getGraceStatus(todayStatus.punchIn.time, todayStatus.workStartTime) : null;
  const shiftDisplay = todayStatus ? `${todayStatus.workStartTime} \u2013 ${todayStatus.workEndTime}` : "09:00 \u2013 18:00";

  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">{currentTime.dateStr}</p>
          <h1>{getGreeting(currentTime.hours)}, {displayName.split(/\s+/)[0]}</h1>
          <p>{dayComplete ? "Your workday is complete. See you tomorrow!" : hasPunchedIn ? "You're clocked in. Don't forget to punch out when you leave." : "Ready to start your workday? Take a clear selfie to mark your attendance."}</p>
        </div>
        <div className="time-card">
          <small>Current time</small>
          <strong>{currentTime.timeStr.replace(/(am|pm)/i, "").trim()}</strong>
          <span>{currentTime.timeStr.includes("AM") || currentTime.timeStr.includes("am") ? "AM" : "PM"} &middot; IST</span>
        </div>
      </section>

      <section className="emp-status-grid">
        <article className="emp-status-card">
          <div className="emp-status-header">
            <span className={`emp-status-dot ${hasPunchedIn ? "active" : ""}`}></span>
            <b>Punch In</b>
          </div>
          {hasPunchedIn && todayStatus?.punchIn ? (
            <div className="emp-status-detail">
              <strong>{formatTimeIST(todayStatus.punchIn.time)}</strong>
              {graceInfo && <span className={`grace-badge ${graceInfo.className}`}>{graceInfo.label}</span>}
            </div>
          ) : (
            <div className="emp-status-detail"><span className="pending-text">Not yet recorded</span></div>
          )}
        </article>

        <article className="emp-status-card">
          <div className="emp-status-header">
            <span className={`emp-status-dot ${hasPunchedOut ? "active out" : ""}`}></span>
            <b>Punch Out</b>
          </div>
          {hasPunchedOut && todayStatus?.punchOut ? (
            <div className="emp-status-detail">
              <strong>{formatTimeIST(todayStatus.punchOut.time)}</strong>
              <span className="grace-badge on-time">Completed</span>
            </div>
          ) : (
            <div className="emp-status-detail"><span className="pending-text">{hasPunchedIn ? "Awaiting punch out" : "\u2014"}</span></div>
          )}
        </article>

        <article className="emp-status-card duration-card">
          <div className="emp-status-header">
            <b>Work Duration</b>
            <span className="duration-value">{elapsed || "\u2014"}</span>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${progressPct}%` }}></div>
          </div>
          <div className="progress-labels">
            <small>{formatDuration(workedMinutes)} worked</small>
            <small>{formatDuration(expectedMinutes)} expected</small>
          </div>
          {dayComplete && (
            <div className={`completion-status ${progressPct >= 100 ? "complete" : "incomplete"}`}>
              {progressPct >= 100 ? "Full day completed" : `${progressPct}% of expected hours`}
            </div>
          )}
        </article>
      </section>

      {!dayComplete && (
        <section className="punch-grid">
          <article className="camera-card">
            <div className="card-heading">
              <div><span className="step">1</span><b>Take your selfie</b></div>
              <span className="secure">Secure capture</span>
            </div>
            <div className={`camera-frame ${photo ? "has-photo" : ""}`}>
              {cameraOpen ? (
                <video ref={videoRef} autoPlay muted playsInline />
              ) : photo ? (
                <img src={photo} alt="Captured attendance selfie" />
              ) : (
                <div className="camera-empty">
                  <span className="camera-icon">&#9678;</span>
                  <b>Camera preview</b>
                  <p>Your selfie will be used only for attendance verification.</p>
                </div>
              )}
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            </div>
            {cameraOpen ? (
              <button className="primary" onClick={capture}>Capture selfie</button>
            ) : (
              <button className="secondary" onClick={() => { setPhoto(null); setCameraOpen(true); }}>{photo ? "Retake selfie" : "Open camera"}</button>
            )}
          </article>

          <aside className="punch-card">
            <div className="card-heading">
              <div><span className="step">2</span><b>{nextPunchType === "IN" ? "Punch in" : "Punch out"}</b></div>
            </div>
            <div className="status-row">
              <span className={`status-icon ${nextPunchType === "OUT" ? "out-icon" : ""}`}>{nextPunchType === "IN" ? "\u2198" : "\u2197"}</span>
              <div>
                <small>Punch {nextPunchType.toLowerCase()}</small>
                <b>{nextPunchType === "IN" ? "Mark your arrival" : "Mark your departure"}</b>
              </div>
              {hasPunchedIn && <span className="badge success">Clocked in</span>}
            </div>
            <dl>
              <div><dt>Date</dt><dd>{currentTime.fullDateStr}</dd></div>
              <div><dt>Office</dt><dd>{todayStatus?.office || "\u2014"}</dd></div>
              <div>
                <dt>Location</dt>
                <dd>
                  {locationLoading && <span className="pending-text">Acquiring GPS...</span>}
                  {location && <span className="grace-badge on-time">GPS locked ({"\u00B1"}{Math.round(location.accuracy)}m)</span>}
                  {locationError && !locationLoading && (
                    <span className="grace-badge late" style={{ fontSize: 11 }}>{locationError}</span>
                  )}
                  {!location && !locationLoading && !locationError && (
                    <button className="secondary" onClick={acquireLocation} style={{ padding: "4px 12px", fontSize: 13 }}>Enable location</button>
                  )}
                </dd>
              </div>
              <div><dt>Shift</dt><dd>{shiftDisplay}</dd></div>
              {hasPunchedIn && todayStatus?.punchIn && (
                <div><dt>Punched in at</dt><dd>{formatTimeIST(todayStatus.punchIn.time)}</dd></div>
              )}
              {elapsed && !dayComplete && (
                <div><dt>Time elapsed</dt><dd>{elapsed}</dd></div>
              )}
            </dl>
            <button
              className={`primary punch ${nextPunchType === "OUT" ? "punch-out-btn" : ""}`}
              onClick={submitPunch}
              disabled={saving || !location}
            >
              {saving ? "Saving securely..." : !location ? "Waiting for GPS..." : nextPunchType === "IN" ? "Punch in with selfie" : "Punch out with selfie"}
            </button>
            {locationError && !locationLoading && (
              <button className="secondary" onClick={acquireLocation} style={{ marginTop: 8, width: "100%" }}>Retry location</button>
            )}
            {message && <p className={`form-message ${!message.includes("Could not") && !message.includes("Waiting") && !message.includes("not within") ? "success-text" : ""}`}>{message}</p>}
            <p className="server-note">Timestamp is generated securely by the server</p>
            {location && location.accuracy > 100 && (
              <div className="tip">
                <span>&#9888;</span>
                <p><b>Low GPS accuracy</b><br />Your GPS accuracy is {Math.round(location.accuracy)}m. Move to an open area or near a window for better accuracy.</p>
              </div>
            )}
            <div className="tip">
              <span>&#9788;</span>
              <p><b>Grace period</b><br />You have a 15-minute grace window after your shift start time.</p>
            </div>
          </aside>
        </section>
      )}

      {dayComplete && (
        <section className="day-complete-card">
          <div className="day-complete-icon">&#10003;</div>
          <h2>Workday complete</h2>
          <p>You punched in at <b>{todayStatus?.punchIn ? formatTimeIST(todayStatus.punchIn.time) : ""}</b> and out at <b>{todayStatus?.punchOut ? formatTimeIST(todayStatus.punchOut.time) : ""}</b>.</p>
          <p>Total hours: <b>{elapsed}</b> ({progressPct >= 100 ? "target met" : `${progressPct}% of target`})</p>
        </section>
      )}

      {hasPunchedIn && todayStatus?.punchIn && (
        <section className="punch-photos-row">
          <h3>Today&apos;s selfies</h3>
          <div className="punch-row">
            <div className="punch-thumb-wrap">
              {todayStatus.punchIn.photoKey ? (
                <img className="punch-thumb" src={`/api/attendance/photo?key=${encodeURIComponent(todayStatus.punchIn.photoKey)}`} alt="Punch in" />
              ) : (
                <div className="punch-thumb empty-thumb" />
              )}
              <div className="punch-thumb-info">
                <b>Punch In</b>
                <span>{formatTimeIST(todayStatus.punchIn.time)}</span>
                <small>{todayStatus.punchIn.office}</small>
              </div>
            </div>
            <div className="punch-thumb-divider" />
            <div className="punch-thumb-wrap">
              {todayStatus.punchOut?.photoKey ? (
                <img className="punch-thumb" src={`/api/attendance/photo?key=${encodeURIComponent(todayStatus.punchOut.photoKey)}`} alt="Punch out" />
              ) : (
                <div className="punch-thumb empty-thumb" />
              )}
              <div className="punch-thumb-info">
                <b>Punch Out</b>
                <span>{todayStatus.punchOut ? formatTimeIST(todayStatus.punchOut.time) : "\u2014"}</span>
                {todayStatus.punchOut && <small>{todayStatus.punchOut.office}</small>}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
