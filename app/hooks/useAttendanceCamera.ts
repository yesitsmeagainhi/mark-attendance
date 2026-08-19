"use client";

import { useEffect, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import { formatDuration, formatTimeIST } from "../../lib/time-utils";
import type { FaceEvalStatus, TodayStatus } from "../components/employee/attendance-types";

export type GeoAlert = {
  branchName: string;
  distance: number;
  allowedRadius: number;
};

export type UseAttendanceCameraReturn = {
  cameraOpen: boolean;
  openCamera: () => void;
  closeCamera: () => void;
  saving: boolean;
  photo: string | null;
  message: string;
  todayStatus: TodayStatus | null;
  fetchStatus: () => void;
  location: { latitude: number; longitude: number; accuracy: number } | null;
  locationError: string;
  locationLoading: boolean;
  acquireLocation: () => void;
  modelsLoaded: boolean;
  modelError: string;
  faceStatus: FaceEvalStatus;
  faceGuidance: string;
  setFaceUpdate: (status: FaceEvalStatus, guidance: string) => void;
  nextPunchType: "IN" | "OUT" | null;
  currentlyIn: boolean;
  lastPunchTime: string | null;
  shiftDisplay: string;
  elapsed: string;
  setPhoto: (p: string | null) => void;
  setMessage: (m: string) => void;
  handleCaptureFrame: (frame: string) => Promise<void>;
  geoAlert: GeoAlert | null;
  dismissGeoAlert: () => void;
};

export function useAttendanceCamera({ enabled = true }: { enabled?: boolean } = {}): UseAttendanceCameraReturn {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [elapsed, setElapsed] = useState("");

  // GPS
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);

  // Face detection
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelError, setModelError] = useState("");
  const [faceStatus, setFaceStatus] = useState<FaceEvalStatus>("no-face");
  const [faceGuidance, setFaceGuidance] = useState("Position your face in the frame");

  // Geo-fence alert
  const [geoAlert, setGeoAlert] = useState<GeoAlert | null>(null);
  const dismissGeoAlert = useCallback(() => setGeoAlert(null), []);

  const fetchStatus = useCallback(() => {
    if (!enabled) return;
    fetch("/api/attendance/status")
      .then((r) => r.ok ? r.json() : null)
      .then((data: TodayStatus | null) => { if (data) setTodayStatus(data); })
      .catch(() => undefined);
  }, [enabled]);

  const acquireLocation = useCallback(() => {
    if (!enabled) return;
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
  }, [enabled]);

  // Auto-acquire GPS on mount
  useEffect(() => {
    if (!enabled) return;
    acquireLocation();
  }, [enabled, acquireLocation]);

  // Fetch status on mount
  useEffect(() => {
    if (!enabled) return;
    fetchStatus();
  }, [enabled, fetchStatus]);

  // Load face detection models once
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  // Elapsed duration (supports multi-session)
  useEffect(() => {
    if (!enabled) return;
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
          total += Math.max(0, Math.floor((Date.now() - inDate.getTime()) / 60000));
        }
      }
      setElapsed(formatDuration(total));
    }

    calcTotal();
    const lastP = allPunches[allPunches.length - 1];
    if (lastP?.type === "IN") {
      const interval = setInterval(calcTotal, 30000);
      return () => clearInterval(interval);
    }
  }, [enabled, todayStatus]);

  // Derived values
  const punches = todayStatus?.punches || [];
  const nextPunchType = todayStatus?.nextPunchType ?? "IN";
  const lastPunch = punches.length > 0 ? punches[punches.length - 1] : null;
  const currentlyIn = lastPunch?.type === "IN";
  const lastPunchTime = lastPunch ? formatTimeIST(lastPunch.time) : null;
  const shiftDisplay = todayStatus ? `${todayStatus.workStartTime} \u2013 ${todayStatus.workEndTime}` : "09:00 \u2013 18:00";

  const openCamera = useCallback(() => {
    setPhoto(null);
    setCameraOpen(true);
  }, []);

  const closeCamera = useCallback(() => {
    setCameraOpen(false);
  }, []);

  const setFaceUpdate = useCallback((status: FaceEvalStatus, guidance: string) => {
    setFaceStatus(status);
    setFaceGuidance(guidance);
  }, []);

  const handleCaptureFrame = useCallback(async (frame: string) => {
    if (!location) {
      setMessage("Waiting for GPS location. Please allow location access and try again.");
      acquireLocation();
      return;
    }
    setPhoto(frame);
    setCameraOpen(false);
    setSaving(true);
    setMessage("");
    try {
      const blob = await (await fetch(frame)).blob();
      const form = new FormData();
      form.append("photo", blob, "selfie.jpg");
      form.append("punchType", nextPunchType as string);
      form.append("office", todayStatus?.office || "");
      form.append("latitude", location.latitude.toString());
      form.append("longitude", location.longitude.toString());
      const response = await fetch("/api/attendance", { method: "POST", body: form });
      const result = await response.json() as { error?: string; geoAlert?: GeoAlert };
      if (!response.ok) {
        if (result.geoAlert) setGeoAlert(result.geoAlert);
        throw new Error(result.error || "Could not mark attendance.");
      }
      setMessage(nextPunchType === "IN" ? "Punch in recorded successfully." : "Punch out recorded. Have a great evening!");
      setPhoto(null);
      setLocation(null);
      acquireLocation();
      fetchStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark attendance.");
    } finally {
      setSaving(false);
    }
  }, [location, nextPunchType, todayStatus?.office, acquireLocation, fetchStatus]);

  return {
    cameraOpen, openCamera, closeCamera,
    saving, photo, message, setPhoto, setMessage,
    todayStatus, fetchStatus,
    location, locationError, locationLoading, acquireLocation,
    modelsLoaded, modelError,
    faceStatus, faceGuidance, setFaceUpdate,
    nextPunchType, currentlyIn, lastPunchTime, shiftDisplay, elapsed,
    handleCaptureFrame,
    geoAlert, dismissGeoAlert,
  };
}
