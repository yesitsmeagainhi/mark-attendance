# Attendly — Hostinger VPS Deployment Guide

Complete step-by-step guide to deploy the Attendly attendance system on a Hostinger VPS.

## Prerequisites

- Hostinger VPS (KVM) with Ubuntu 22.04 or 24.04
- VPS IP address and root password (from Hostinger hPanel)
- GitHub repo: `https://github.com/yesitsmeagainhi/mark-attendance.git`

---

## Step 1: Connect to VPS

```bash
ssh root@<your-server-ip>
```

Use the root password from Hostinger hPanel (Settings → Reset password if forgotten).

---

## Step 2: Install Node.js (v22+)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v   # verify >= 22.13.0
```

---

## Step 3: Install build tools

Required for compiling `better-sqlite3` native module:

```bash
apt-get install -y build-essential python3
```

---

## Step 4: Clone the project

```bash
cd /var/www
git clone https://github.com/yesitsmeagainhi/mark-attendance.git mark_attendance
cd mark_attendance
```

**Authentication:** GitHub no longer accepts passwords. Use a Personal Access Token (PAT):

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. Use the `ghp_...` token as the password when prompted

If the repo is public, no credentials are needed.

---

## Step 5: Install dependencies and build

```bash
cd /var/www/mark_attendance
npm install
npm run build
```

---

## Step 6: Install PM2 and start the app

PM2 keeps the app running permanently and auto-restarts on server reboot.

```bash
npm install -g pm2
cd /var/www/mark_attendance
pm2 start npm --name "attendly" -- start -- -p 3001
pm2 startup
pm2 save
```

> **Note:** We use port 3001 instead of the default 3000 to avoid conflicts
> with other services. Adjust the port if 3001 is also in use.

### Verify the app is running

```bash
pm2 status
pm2 logs attendly --lines 10
```

---

## Step 7: Stop Caddy (if running)

Hostinger VPS may come with Caddy pre-installed on port 80. It conflicts with Nginx.

```bash
systemctl stop caddy && systemctl disable caddy
```

---

## Step 8: Install and configure Nginx

```bash
apt-get install -y nginx
```

Create the config file:

```bash
nano /etc/nginx/sites-available/attendly
```

Paste the following:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> Replace `yourdomain.com` with your actual domain, or use `_` to accept any hostname.

Enable the site:

```bash
ln -s /etc/nginx/sites-available/attendly /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

---

## Step 9: Point your domain (optional)

In your domain registrar's DNS settings, add:

| Type | Name | Value            |
|------|------|------------------|
| A    | @    | your-server-ip   |
| A    | www  | your-server-ip   |

Wait for DNS propagation (can take up to 24 hours).

---

## Step 10: Enable SSL with Let's Encrypt (optional)

Only after your domain is pointing to the VPS:

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## Access the app

- **With domain:** `https://yourdomain.com`
- **Without domain:** `http://<your-server-ip>`

---

## Common PM2 Commands

```bash
pm2 status              # check app status
pm2 logs attendly       # view logs
pm2 restart attendly    # restart the app
pm2 stop attendly       # stop the app
pm2 delete attendly     # remove from PM2
```

---

## Updating the App (after code changes)

```bash
cd /var/www/mark_attendance
git pull
npm install
npm run build
pm2 restart attendly
```

> If the repo is private, you'll need a valid GitHub PAT for `git pull`.

---

## Troubleshooting

### Port already in use

Find what's using the port:

```bash
ss -tlnp | grep :3001
```

Kill the specific process:

```bash
kill -9 <PID>
```

Or use a different port:

```bash
pm2 delete attendly
pm2 start npm --name "attendly" -- start -- -p 3002
```

Then update the `proxy_pass` port in `/etc/nginx/sites-available/attendly` and restart Nginx.

### Nginx won't start (port 80 in use)

```bash
ss -tlnp | grep :80
# If Caddy: systemctl stop caddy && systemctl disable caddy
# If Apache: systemctl stop apache2 && systemctl disable apache2
systemctl start nginx
```

### SSL certificate fails

- Ensure your domain's DNS A record points to your VPS IP
- Ensure port 80 is open and Nginx is running
- Wait for DNS propagation before retrying

### App crashes or errors

```bash
pm2 logs attendly --lines 50
```

---

## Important Notes

- **SQLite database** is stored as a file on disk — back it up regularly
- **Selfie photos** are stored locally — ensure the upload directory is writable
- **face-api.js models** must be present in the `public/` folder
- **Environment variables** — create `.env` on the server manually, never commit secrets to git
- **HTTPS is required** for camera access on mobile browsers
















"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import { timeToMinutes, formatDuration, formatTimeIST, getIST, getGreeting, getGraceStatus } from "../../../lib/time-utils";

// --- Face detection helpers (module-level, outside component) ---

type FaceEvalStatus = "no-face" | "multiple" | "too-far" | "too-close" | "off-center" | "eyes-closed" | "ready";
type FaceEvalResult = { status: FaceEvalStatus; guidance: string };

function ptDistance(p1: faceapi.Point, p2: faceapi.Point): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function calculateEAR(eye: faceapi.Point[]): number {
  const vertical1 = ptDistance(eye[1], eye[5]);
  const vertical2 = ptDistance(eye[2], eye[4]);
  const horizontal = ptDistance(eye[0], eye[3]);
  if (horizontal === 0) return 0;
  return (vertical1 + vertical2) / (2 * horizontal);
}

function evaluateDetections(
  detections: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>[],
  fw: number,
  fh: number,
): FaceEvalResult {
  if (detections.length === 0) return { status: "no-face", guidance: "No face detected. Position your face in the frame." };
  if (detections.length > 1) return { status: "multiple", guidance: "Multiple faces detected. Only one person should be in frame." };

  const box = detections[0].detection.box;
  const faceRatio = (box.width * box.height) / (fw * fh);
  if (faceRatio < 0.04) return { status: "too-far", guidance: "Move closer to the camera." };
  if (faceRatio > 0.55) return { status: "too-close", guidance: "Move further from the camera." };

  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (Math.abs(cx - fw / 2) > fw * 0.30 || Math.abs(cy - fh / 2) > fh * 0.30) {
    return { status: "off-center", guidance: "Center your face in the frame." };
  }

  const lm = detections[0].landmarks;
  const avgEAR = (calculateEAR(lm.getLeftEye()) + calculateEAR(lm.getRightEye())) / 2;
  if (avgEAR < 0.2) return { status: "eyes-closed", guidance: "Please open your eyes." };

  return { status: "ready", guidance: "Looking good! You can capture now." };
}

function drawFaceOverlay(
  ctx: CanvasRenderingContext2D,
  detections: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>[],
  status: FaceEvalStatus,
  fw: number,
) {
  const colorMap: Record<string, string> = {
    ready: "#22c55e", "eyes-closed": "#eab308", "off-center": "#eab308",
    "too-far": "#eab308", "too-close": "#eab308", multiple: "#ef4444", "no-face": "#ef4444",
  };
  const color = colorMap[status] || "#ef4444";

  for (const det of detections) {
    const box = det.detection.box;
    const mx = fw - box.x - box.width; // mirror X since video is CSS-flipped
    const cornerLen = Math.min(box.width, box.height) * 0.15;

    // Bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, box.y, box.width, box.height);

    // Corner accents
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    const corners: [number, number, number, number][] = [
      [mx, box.y, 1, 1], [mx + box.width, box.y, -1, 1],
      [mx, box.y + box.height, 1, -1], [mx + box.width, box.y + box.height, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen * dy);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen * dx, y);
      ctx.stroke();
    }

    // Eye dots
    if (status !== "no-face" && status !== "multiple") {
      const eyeColor = status === "eyes-closed" ? "#ef4444" : "#22c55e";
      for (const eye of [det.landmarks.getLeftEye(), det.landmarks.getRightEye()]) {
        const ecx = fw - eye.reduce((s, p) => s + p.x, 0) / eye.length;
        const ecy = eye.reduce((s, p) => s + p.y, 0) / eye.length;
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.arc(ecx, ecy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

type PunchRecord = { type: "IN" | "OUT"; time: string; office: string; photoKey?: string };

type TodayStatus = {
  workStartTime: string;
  workEndTime: string;
  office: string;
  punchIn: { time: string; office: string; photoKey?: string } | null;
  punchOut: { time: string; office: string; photoKey?: string } | null;
  punches: PunchRecord[];
  rules: { gracePeriod: number; lunchBreakEnabled: boolean; lunchBreakMinHours: number };
  nextPunchType: "IN" | "OUT" | null;
  canPunchIn: boolean;
  canPunchOut: boolean;
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
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  // Face detection state
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelError, setModelError] = useState("");
  const [faceStatus, setFaceStatus] = useState<FaceEvalStatus>("no-face");
  const [faceGuidance, setFaceGuidance] = useState("Position your face in the frame");
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectionLoopRef = useRef<number | null>(null);

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

  // Elapsed duration (supports multi-session)
  useEffect(() => {
    const allPunches = todayStatus?.punches || [];
    if (allPunches.length === 0) { setElapsed(""); return; }

    function calcTotal() {
      let total = 0;
      for (let i = 0; i < allPunches.length; i += 2) {
        if (allPunches[i]?.type !== "IN") break;
        const inDate = new Date(allPunches[i].time.replace(" ", "T") + (allPunches[i].time.includes("Z") ? "" : "Z"));
        if (allPunches[i + 1]?.type === "OUT") {
          const outDate = new Date(allPunches[i + 1].time.replace(" ", "T") + (allPunches[i + 1].time.includes("Z") ? "" : "Z"));
          total += Math.max(0, Math.floor((outDate.getTime() - inDate.getTime()) / 60000));
        } else {
          // Currently active session
          total += Math.max(0, Math.floor((Date.now() - inDate.getTime()) / 60000));
        }
      }
      setElapsed(formatDuration(total));
    }

    calcTotal();
    const lastP = allPunches[allPunches.length - 1];
    if (lastP?.type === "IN") {
      // Currently clocked in — update live
      const interval = setInterval(calcTotal, 30000);
      return () => clearInterval(interval);
    }
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

  // Load face detection models (once on mount)
  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        ]);
        if (!cancelled) setModelsLoaded(true);
      } catch {
        if (!cancelled) setModelError("Face detection unavailable. You can still capture manually.");
      }
    }
    loadModels();
    return () => { cancelled = true; };
  }, []);

  // Sync overlay canvas size with video display size
  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !overlayCanvasRef.current) return;
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    function syncSize() {
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    video.addEventListener("loadedmetadata", syncSize);
    const observer = new ResizeObserver(syncSize);
    observer.observe(video);
    syncSize();
    return () => { video.removeEventListener("loadedmetadata", syncSize); observer.disconnect(); };
  }, [cameraOpen]);

  // Face detection loop
  useEffect(() => {
    if (!cameraOpen || !modelsLoaded || !videoRef.current || !overlayCanvasRef.current) return;
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    let lastTime = 0;

    async function detectLoop(timestamp: number) {
      if (!video || !canvas || video.paused || video.ended) return;
      if (timestamp - lastTime >= 200) {
        lastTime = timestamp;
        try {
          const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
          const detections = await faceapi.detectAllFaces(video, options).withFaceLandmarks();
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const dw = canvas.width, dh = canvas.height;
          const resized = faceapi.resizeResults(detections, { width: dw, height: dh });
          const result = evaluateDetections(resized, dw, dh);
          setFaceStatus(result.status);
          setFaceGuidance(result.guidance);
          if (resized.length > 0) drawFaceOverlay(ctx, resized, result.status, dw);
        } catch {
          // Detection error — skip frame
        }
      }
      detectionLoopRef.current = requestAnimationFrame(detectLoop);
    }

    function start() {
      if (video.readyState >= 2) {
        detectionLoopRef.current = requestAnimationFrame(detectLoop);
      } else {
        video.addEventListener("playing", () => {
          detectionLoopRef.current = requestAnimationFrame(detectLoop);
        }, { once: true });
      }
    }
    start();

    return () => {
      if (detectionLoopRef.current) { cancelAnimationFrame(detectionLoopRef.current); detectionLoopRef.current = null; }
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      setFaceStatus("no-face");
      setFaceGuidance("Position your face in the frame");
    };
  }, [cameraOpen, modelsLoaded]);

  function captureFrame(): string | null {
    const video = videoRef.current;
    if (!video) return null;
    const canvas = document.createElement("canvas");
    // Cap resolution to 480px max dimension to keep file sizes small (~30-50KB)
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 720;
    const scale = Math.min(1, 480 / Math.max(vw, vh));
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .60);
  }

  const hasPunchedIn = !!todayStatus?.punchIn;
  const punches = todayStatus?.punches || [];
  const nextPunchType = todayStatus?.nextPunchType ?? "IN";
  const dayComplete = nextPunchType === null;
  const lastPunch = punches.length > 0 ? punches[punches.length - 1] : null;
  const currentlyIn = lastPunch?.type === "IN";
  const hasPunchedOut = lastPunch?.type === "OUT" && hasPunchedIn;

  async function captureAndSubmit() {
    if (!cameraOpen) return setCameraOpen(true);
    if (!location) {
      setMessage("Waiting for GPS location. Please allow location access and try again.");
      acquireLocation();
      return;
    }
    const frame = captureFrame();
    if (!frame) return;
    setPhoto(frame);
    setCameraOpen(false);
    setSaving(true);
    setMessage("");
    try {
      const blob = await (await fetch(frame)).blob();
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
      acquireLocation();
      fetchStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark attendance.");
      // Keep photo visible so user can see what was captured on failure
    } finally {
      setSaving(false);
    }
  }

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
  const graceInfo = todayStatus?.punchIn ? getGraceStatus(todayStatus.punchIn.time, todayStatus.workStartTime, gracePeriod) : null;
  const shiftDisplay = todayStatus ? `${todayStatus.workStartTime} \u2013 ${todayStatus.workEndTime}` : "09:00 \u2013 18:00";

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
              {cameraOpen ? (
                <>
                  <video ref={videoRef} autoPlay muted playsInline />
                  <canvas ref={overlayCanvasRef} className="face-detect-overlay" />
                  <div className={`face-guidance face-guidance-${faceStatus}`}>
                    <span className="face-guidance-dot" />
                    {faceGuidance}
                  </div>
                  {!modelsLoaded && !modelError && (
                    <div className="face-model-loading">Loading face detection...</div>
                  )}
                </>
              ) : photo ? (
                <img src={photo} alt="Captured attendance selfie" />
              ) : (
                <div className="camera-empty">
                  <span className="camera-icon">&#9678;</span>
                  <p>Tap below to open camera</p>
                </div>
              )}
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            </div>
            {modelError && cameraOpen && <p className="face-model-error">{modelError}</p>}

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

            {cameraOpen ? (
              <button
                className={`primary punch ${nextPunchType === "OUT" ? "punch-out-btn" : ""}`}
                onClick={captureAndSubmit}
                disabled={saving || !location || (modelsLoaded && !modelError && faceStatus !== "ready")}
              >
                {saving
                  ? "Saving..."
                  : !location
                    ? "Waiting for GPS..."
                    : modelsLoaded && !modelError && faceStatus !== "ready"
                      ? faceGuidance
                      : nextPunchType === "IN" ? "Capture & Punch In" : "Capture & Punch Out"}
              </button>
            ) : (
              <button
                className={`primary punch ${nextPunchType === "OUT" ? "punch-out-btn" : ""}`}
                onClick={() => { setPhoto(null); setCameraOpen(true); }}
                disabled={saving}
              >
                {photo ? "Retake" : nextPunchType === "IN" ? "Open Camera to Punch In" : "Open Camera to Punch Out"}
              </button>
            )}

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
    </>
  );
}
