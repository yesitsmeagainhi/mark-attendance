"use client";

import { useEffect, useRef, useCallback } from "react";
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
}: FullscreenCameraOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const onFaceUpdateRef = useRef(onFaceUpdate);
  onCloseRef.current = onClose;
  onFaceUpdateRef.current = onFaceUpdate;

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Start camera stream (runs once on mount)
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => { if (!cancelled) onCloseRef.current(); });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

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
          if (resized.length > 0) drawOverlay(ctx, resized, result.status, dw);
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
  }, [modelsLoaded, modelError]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const c = document.createElement("canvas");
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 720;
    const scale = Math.min(1, 480 / Math.max(vw, vh));
    c.width = Math.round(vw * scale);
    c.height = Math.round(vh * scale);
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
    const frame = c.toDataURL("image/jpeg", 0.60);
    // Stop camera before calling parent
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    onCaptureFrame(frame);
  }, [onCaptureFrame]);

  const isReady = faceStatus === "ready";
  const canCapture = !saving && !!location && (isReady || !modelsLoaded || !!modelError);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fullscreen-camera-overlay">
      <video ref={videoRef} autoPlay muted playsInline className="fco-video" />
      <canvas ref={canvasRef} className="fco-canvas" />

      <div className="fco-top-bar">
        <button className="fco-close-btn" onClick={onClose} aria-label="Close camera">
          &times;
        </button>
        <span className={`fco-punch-badge ${nextPunchType === "OUT" ? "fco-punch-out" : ""}`}>
          {nextPunchType === "IN" ? "PUNCH IN" : "PUNCH OUT"}
        </span>
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

      {/* {(officeName || shiftDisplay) && (
        <div className="fco-info-strip">
          {officeName && <span>{officeName}</span>}
          {officeName && shiftDisplay && <span className="fco-sep">&middot;</span>}
          {shiftDisplay && <span>{shiftDisplay}</span>}
          {currentlyIn && lastPunchTime && (
            <>
              <span className="fco-sep">&middot;</span>
              <span>In: {lastPunchTime}</span>
              {elapsed && (
                <>
                  <span className="fco-sep">&middot;</span>
                  <span>{elapsed}</span>
                </>
              )}
            </>
          )}
        </div>
      )} */}

      <div className={`fco-guidance fco-guidance-${faceStatus}`}>
        <span className="fco-guidance-dot" />
        {faceGuidance}
      </div>

      {!modelsLoaded && !modelError && (
        <div className="fco-model-loading">Loading face detection...</div>
      )}
      {modelError && (
        <div className="fco-model-error">{modelError}</div>
      )}

      <div className="fco-bottom-area">
        <button
          className={`fco-capture-btn ${nextPunchType === "OUT" ? "fco-capture-out" : ""} ${canCapture ? "" : "fco-capture-disabled"}`}
          onClick={handleCapture}
          disabled={!canCapture}
        >
          <span className="fco-capture-ring" />
        </button>
        <div className="fco-capture-label">
          {saving
            ? "Saving..."
            : !location
              ? "Waiting for GPS..."
              : modelsLoaded && !modelError && !isReady
                ? faceGuidance
                : nextPunchType === "IN"
                  ? "Capture & Punch In"
                  : "Capture & Punch Out"}
        </div>
      </div>
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
) {
  const colorMap: Record<string, string> = {
    ready: "#22c55e", "eyes-closed": "#eab308", "off-center": "#eab308",
    "too-far": "#eab308", "too-close": "#eab308", multiple: "#ef4444", "no-face": "#ef4444",
  };
  const color = colorMap[status] || "#ef4444";
  for (const det of detections) {
    const box = det.detection.box;
    const mx = fw - box.x - box.width;
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
        const ecx = fw - eye.reduce((s: number, p: { x: number }) => s + p.x, 0) / eye.length;
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
