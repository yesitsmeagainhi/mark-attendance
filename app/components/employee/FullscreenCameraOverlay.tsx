"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { FaceEvalStatus } from "./attendance-types";

type FullscreenCameraOverlayProps = {
  modelsLoaded: boolean;
  modelError: string;
  faceStatus: FaceEvalStatus;
  faceGuidance: string;
  nextPunchType: "IN" | "OUT";
  officeName: string;
  shiftDisplay: string;
  location: { latitude: number; longitude: number; accuracy: number } | null;
  locationLoading: boolean;
  locationError: string;
  currentlyIn: boolean;
  lastPunchTime: string | null;
  elapsed: string;
  onCaptureFrame: (frame: string) => void;
  onClose: () => void;
  onRetryGPS: () => void;
  onFaceUpdate: (status: FaceEvalStatus, guidance: string) => void;
  saving: boolean;
  withinGeoFence: boolean | null;
  geoFenceInfo: { branchName: string; distance: number; allowedRadius: number } | null;
};

export default function FullscreenCameraOverlay({
  modelsLoaded,
  modelError,
  faceStatus,
  faceGuidance,
  nextPunchType,
  // officeName,
  // shiftDisplay,
  location,
  locationLoading,
  locationError,
  // currentlyIn,
  // lastPunchTime,
  // elapsed,
  onCaptureFrame,
  onClose,
  onRetryGPS,
  onFaceUpdate,
  saving,
  withinGeoFence,
  geoFenceInfo,
}: FullscreenCameraOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const onFaceUpdateRef = useRef(onFaceUpdate);
  onCloseRef.current = onClose;
  onFaceUpdateRef.current = onFaceUpdate;

  const monitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Start/restart the stream whenever the selected camera changes.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({
      video: {
        facingMode: { ideal: cameraFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        zoom: 1.0,
      } as MediaTrackConstraints,
      audio: false,
    })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        // Disable Center Stage auto-framing on iOS/iPadOS
        const track = stream.getVideoTracks()[0];
        try {
          const caps = track?.getCapabilities?.() as Record<string, unknown> | undefined;
          if (caps?.zoom) {
            track.applyConstraints({ advanced: [{ zoom: 1.0 } as MediaTrackConstraintSet] }).catch(() => { });
          }
        } catch { /* non-Safari browsers ignore this */ }

        // Continuous monitor: detect zoom/resolution changes and auto-correct
        let lastTrackW = 0, lastTrackH = 0;
        function pollCameraState() {
          const trk = stream.getVideoTracks()[0];
          if (!trk) return;
          const s = trk.getSettings();
          const tw = s.width ?? 0, th = s.height ?? 0;

          if (lastTrackW && lastTrackH && (tw !== lastTrackW || th !== lastTrackH)) {
            try {
              trk.applyConstraints({ advanced: [{ zoom: 1.0 } as MediaTrackConstraintSet] }).catch(() => { });
            } catch { /* ignore */ }
          }
          lastTrackW = tw;
          lastTrackH = th;
        }
        pollCameraState();
        monitorRef.current = setInterval(pollCameraState, 500);
      })
      .catch(() => { if (!cancelled) onCloseRef.current(); });
    return () => {
      cancelled = true;
      if (monitorRef.current) { clearInterval(monitorRef.current); monitorRef.current = null; }
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [cameraFacingMode]);

  // Sync canvas size with video
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    function syncSize() {
      if (!video || !canvas) return;
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    video.addEventListener("loadedmetadata", syncSize);
    const observer = new ResizeObserver(syncSize);
    observer.observe(video);
    syncSize();
    return () => { video.removeEventListener("loadedmetadata", syncSize); observer.disconnect(); };
  }, []);

  // Face detection loop
  useEffect(() => {
    if (!modelsLoaded || modelError) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let lastTime = 0;

    async function detectLoop(timestamp: number) {
      if (!video || !canvas || video.paused || video.ended) return;
      if (timestamp - lastTime >= 200) {
        lastTime = timestamp;
        try {
          // Dynamic import to avoid loading face-api in this module at top level
          const faceapi = await import("face-api.js");
          const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
          const detections = await faceapi.detectAllFaces(video, options).withFaceLandmarks();
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const dw = canvas.width, dh = canvas.height;
          const resized = faceapi.resizeResults(detections, { width: dw, height: dh });

          // Use the evaluation from parent
          const result = evaluateDetectionsLocal(resized, dw, dh);
          onFaceUpdateRef.current(result.status, result.guidance);
          if (resized.length > 0) {
            drawOverlay(ctx, resized, result.status, dw, cameraFacingMode === "user");
          }
        } catch {
          // skip frame
        }
      }
      detectionRef.current = requestAnimationFrame(detectLoop);
    }

    function start() {
      if (!video) return;
      if (video.readyState >= 2) {
        detectionRef.current = requestAnimationFrame(detectLoop);
      } else {
        video.addEventListener("playing", () => {
          detectionRef.current = requestAnimationFrame(detectLoop);
        }, { once: true });
      }
    }
    start();

    return () => {
      if (detectionRef.current) { cancelAnimationFrame(detectionRef.current); detectionRef.current = null; }
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      onFaceUpdateRef.current("no-face", "Position your face in the frame");
    };
  }, [modelsLoaded, modelError, cameraFacingMode]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const c = document.createElement("canvas");
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 720;
    const scale = Math.min(1, 480 / Math.max(vw, vh));
    c.width = Math.round(vw * scale);
    c.height = Math.round(vh * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Mirror only the front-camera image to match its selfie preview.
    if (cameraFacingMode === "user") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, c.width, c.height);
    const frame = c.toDataURL("image/jpeg", 0.60);
    setPreviewFrame(frame);
  }, [cameraFacingMode]);

  const handleConfirm = useCallback(() => {
    if (!previewFrame) return;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    onCaptureFrame(previewFrame);
  }, [previewFrame, onCaptureFrame]);

  const handleRetake = useCallback(() => {
    setPreviewFrame(null);
  }, []);

  const isReady = faceStatus === "ready";
  const isOutsideGeoFence = withinGeoFence === false;
  const canCapture = !saving && !!location && !isOutsideGeoFence && (isReady || !modelsLoaded || !!modelError);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fullscreen-camera-overlay">
      {/* Camera view — hidden during preview */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="fco-video"
        style={{
          ...(previewFrame ? { display: "none" } : {}),
          transform: cameraFacingMode === "user" ? "scaleX(-1)" : "none",
        }}
      />
      <canvas ref={canvasRef} className="fco-canvas" style={previewFrame ? { display: "none" } : undefined} />

      {previewFrame ? (
        <>
          <img src={previewFrame} alt="Selfie preview" className="fco-preview-img" />
          <div className="fco-preview-label">Review your selfie</div>
          <div className="fco-preview-actions">
            <button className="fco-retake-btn" onClick={handleRetake}>
              Retake
            </button>
            <button className={`fco-confirm-btn ${nextPunchType === "OUT" ? "fco-confirm-out" : ""}`} onClick={handleConfirm} disabled={saving}>
              {saving ? "Saving..." : nextPunchType === "IN" ? "Confirm & Punch In" : "Confirm & Punch Out"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="fco-top-bar">
            <button className="fco-close-btn" onClick={onClose} aria-label="Close camera">
              &times;
            </button>
            <span className={`fco-punch-badge ${nextPunchType === "OUT" ? "fco-punch-out" : ""}`}>
              {nextPunchType === "IN" ? "PUNCH IN" : "PUNCH OUT"}
            </span>
            <button
              type="button"
              onClick={() => setCameraFacingMode((mode) => mode === "user" ? "environment" : "user")}
              aria-label={cameraFacingMode === "user" ? "Switch to back camera" : "Switch to front camera"}
              title={cameraFacingMode === "user" ? "Switch to back camera" : "Switch to front camera"}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                borderRadius: 999,
                padding: "8px 12px",
                marginLeft: 8,
                color: "#fff",
                background: "rgba(0,0,0,0.35)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {cameraFacingMode === "user" ? "↻ Back camera" : "↻ Front camera"}
            </button>
            <div className="fco-gps-status">
              {locationLoading && <span className="fco-gps-loading">GPS...</span>}
              {location && (
                <span className="fco-gps-ok">
                  GPS &plusmn;{Math.round(location.accuracy)}m
                </span>
              )}
              {locationError && !locationLoading && (
                <button className="fco-gps-retry" onClick={onRetryGPS}>Enable GPS</button>
              )}
              {!location && !locationLoading && !locationError && (
                <button className="fco-gps-retry" onClick={onRetryGPS}>Enable GPS</button>
              )}
            </div>
          </div>

          {isOutsideGeoFence && geoFenceInfo && (
            <div className="fco-geofence-alert">
              <span className="fco-geofence-icon">&#9888;</span>
              <span>Outside office range — {geoFenceInfo.distance >= 1000
                ? `${(geoFenceInfo.distance / 1000).toFixed(1)} km`
                : `${geoFenceInfo.distance} m`} from {geoFenceInfo.branchName} (allowed: {geoFenceInfo.allowedRadius} m)</span>
            </div>
          )}

          <div className={`fco-guidance ${isOutsideGeoFence ? "fco-guidance-no-face" : `fco-guidance-${faceStatus}`}`}>
            <span className="fco-guidance-dot" />
            {isOutsideGeoFence ? "You are outside the office area" : faceGuidance}
          </div>

          {!modelsLoaded && !modelError && (
            <div className="fco-model-loading">Loading face detection...</div>
          )}
          {modelError && (
            <div className="fco-model-error">{modelError}</div>
          )}

          <div className="fco-bottom-area">
            <button
              className={`fco-capture-btn ${nextPunchType === "OUT" ? "fco-capture-out" : ""} ${canCapture ? "" : "fco-capture-disabled"} ${isOutsideGeoFence ? "fco-capture-geoblocked" : ""}`}
              onClick={handleCapture}
              disabled={!canCapture}
            >
              <span className="fco-capture-ring" />
            </button>
            <div className={`fco-capture-label ${isOutsideGeoFence ? "fco-capture-label-red" : ""}`}>
              {saving
                ? "Saving..."
                : !location
                  ? "Waiting for GPS..."
                  : isOutsideGeoFence
                    ? "Move closer to office to punch"
                    : modelsLoaded && !modelError && !isReady
                      ? faceGuidance
                      : nextPunchType === "IN"
                        ? "Capture & Punch In"
                        : "Capture & Punch Out"}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

// --- Inline face detection helpers (duplicated from AttendanceTab to keep overlay self-contained) ---

function ptDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function calculateEAR(eye: { x: number; y: number }[]): number {
  const vertical1 = ptDistance(eye[1], eye[5]);
  const vertical2 = ptDistance(eye[2], eye[4]);
  const horizontal = ptDistance(eye[0], eye[3]);
  if (horizontal === 0) return 0;
  return (vertical1 + vertical2) / (2 * horizontal);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function evaluateDetectionsLocal(
  detections: any[],
  fw: number,
  fh: number,
): { status: FaceEvalStatus; guidance: string } {
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

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  detections: any[],
  status: FaceEvalStatus,
  fw: number,
  mirrored: boolean,
) {
  const colorMap: Record<string, string> = {
    ready: "#22c55e", "eyes-closed": "#eab308", "off-center": "#eab308",
    "too-far": "#eab308", "too-close": "#eab308", multiple: "#ef4444", "no-face": "#ef4444",
  };
  const color = colorMap[status] || "#ef4444";
  for (const det of detections) {
    const box = det.detection.box;
    const mx = mirrored ? fw - box.x - box.width : box.x;
    const cornerLen = Math.min(box.width, box.height) * 0.15;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, box.y, box.width, box.height);
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
    if (status !== "no-face" && status !== "multiple") {
      const eyeColor = status === "eyes-closed" ? "#ef4444" : "#22c55e";
      for (const eye of [det.landmarks.getLeftEye(), det.landmarks.getRightEye()]) {
        const eyeCenterX = eye.reduce((s: number, p: { x: number }) => s + p.x, 0) / eye.length;
        const ecx = mirrored ? fw - eyeCenterX : eyeCenterX;
        const ecy = eye.reduce((s: number, p: { y: number }) => s + p.y, 0) / eye.length;
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.arc(ecx, ecy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */



