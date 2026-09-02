"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import * as faceapi from "face-api.js";
import { formatDuration, formatTimeIST } from "../../lib/time-utils";
import { haversineDistance, GEO_FENCE_RADIUS_METERS } from "../../lib/geo-utils";
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
  location: { latitude: number; longitude: number; accuracy: number; timestamp: number } | null;
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
  withinGeoFence: boolean | null; // null = checking, true = inside, false = outside
  geoFenceInfo: { branchName: string; distance: number; allowedRadius: number } | null;
};

export function useAttendanceCamera({ enabled = true }: { enabled?: boolean } = {}): UseAttendanceCameraReturn {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [elapsed, setElapsed] = useState("");

  // GPS
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>(null);
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

  // Real-time geo-fence check
  type BranchRecord = { id: string; name: string; latitude: string; longitude: string; radius: number };
  const [activeBranches, setActiveBranches] = useState<BranchRecord[]>([]);
  const [withinGeoFence, setWithinGeoFence] = useState<boolean | null>(null);
  const [geoFenceInfo, setGeoFenceInfo] = useState<{ branchName: string; distance: number; allowedRadius: number } | null>(null);
  const branchesFetchedRef = useRef(false);

  // Fetch all active branches once
  const [allBranches, setAllBranches] = useState<BranchRecord[]>([]);
  useEffect(() => {
    if (!enabled || branchesFetchedRef.current) return;
    branchesFetchedRef.current = true;
    fetch("/api/branches/active")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { branches?: BranchRecord[] } | null) => {
        if (data?.branches) setAllBranches(data.branches);
      })
      .catch(() => undefined);
  }, [enabled]);

  // Filter to employee's assigned branches (or all if none assigned)
  useEffect(() => {
    if (allBranches.length === 0) { setActiveBranches([]); return; }
    const assigned = todayStatus?.assignedBranchIds;
    if (assigned && assigned.length > 0) {
      const ids = new Set(assigned);
      setActiveBranches(allBranches.filter((b) => ids.has(b.id)));
    } else {
      setActiveBranches(allBranches);
    }
  }, [allBranches, todayStatus?.assignedBranchIds]);

  // Recompute geo-fence status whenever location or branches change
  useEffect(() => {
    if (!location || activeBranches.length === 0) {
      setWithinGeoFence(null);
      setGeoFenceInfo(null);
      return;
    }
    let closest: { branchName: string; distance: number; allowedRadius: number } | null = null;
    let isWithin = false;
    // Add tolerance for GPS accuracy: half of reported accuracy, capped at 50m
    const accuracyTolerance = location.accuracy > 0 ? Math.min(location.accuracy / 2, 50) : 0;
    for (const branch of activeBranches) {
      const brLat = parseFloat(branch.latitude);
      const brLon = parseFloat(branch.longitude);
      if (isNaN(brLat) || isNaN(brLon)) continue;
      const branchRadius = branch.radius || GEO_FENCE_RADIUS_METERS;
      const effectiveRadius = branchRadius + accuracyTolerance;
      const distance = haversineDistance(location.latitude, location.longitude, brLat, brLon);
      if (!closest || distance < closest.distance) {
        closest = { branchName: branch.name, distance: Math.round(distance), allowedRadius: branchRadius };
      }
      if (distance <= effectiveRadius) isWithin = true;
    }
    setWithinGeoFence(isWithin);
    setGeoFenceInfo(closest);
  }, [location, activeBranches]);

  const fetchStatus = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await fetch("/api/attendance/status", { cache: "no-store" });
      if (!r.ok) return;
      const data: TodayStatus | null = await r.json();
      if (data) setTodayStatus(data);
    } catch {
      // ignore — status will be retried on next action
    }
  }, [enabled]);

  const acquireLocation = useCallback(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setLocationError("Your browser does not support GPS location.");
      return;
    }
    setLocationLoading(true);
    setLocationError("");

    const onSuccess = (position: GeolocationPosition) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      });
      setLocationLoading(false);
    };

    const onError = (err: GeolocationPositionError) => {
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
    };

    // Try high-accuracy GPS first (true GPS hardware).
    // If it times out (common on iOS indoors), fall back to
    // enableHighAccuracy: false (WiFi/cell triangulation — faster but less precise).
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === err.TIMEOUT) {
          // Fallback: accept WiFi/cell-tower position
          navigator.geolocation.getCurrentPosition(onSuccess, onError, {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 30000,
          });
        } else {
          onError(err);
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 },
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
    setLocation(null); // clear stale GPS — disables capture until fresh reading arrives
    acquireLocation();
    setCameraOpen(true);
  }, [acquireLocation]);

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
      form.append("accuracy", location.accuracy.toString());
      form.append("gpsTimestamp", location.timestamp.toString());
      const response = await fetch("/api/attendance", { method: "POST", body: form });
      const result = await response.json() as { error?: string; geoAlert?: GeoAlert; serverTimestamp?: string };
      if (!response.ok) {
        if (result.geoAlert) setGeoAlert(result.geoAlert);
        throw new Error(result.error || "Could not mark attendance.");
      }
      setMessage(nextPunchType === "IN" ? "Punch in recorded successfully." : "Punch out recorded. Have a great evening!");
      setPhoto(null);
      // Optimistically flip the punch state so the button text and next
      // punchType update immediately — prevents the stale-closure race
      // where a flex employee punches IN→OUT quickly and the second punch
      // still sends "IN" because fetchStatus() hasn't resolved yet.
      setTodayStatus((prev) => {
        if (!prev) return prev;
        const newPunch = {
          type: nextPunchType as "IN" | "OUT",
          time: result.serverTimestamp ?? new Date().toISOString().replace("T", " ").slice(0, 19),
          office: prev.office || "",
          photoKey: "",
        };
        const flippedType: "IN" | "OUT" | null =
          nextPunchType === "IN" ? "OUT" : prev.flexibleHours ? "IN" : null;
        return {
          ...prev,
          punches: [...(prev.punches || []), newPunch],
          nextPunchType: flippedType,
          canPunchIn: flippedType === "IN",
          canPunchOut: flippedType === "OUT",
          punchIn: prev.punchIn ?? (nextPunchType === "IN" ? newPunch : null),
          punchOut: nextPunchType === "OUT" ? newPunch : prev.punchOut,
        };
      });
      // Force a fresh GPS for the next punch so an employee can't reuse
      // a stale "near office" reading after walking away.  acquireLocation()
      // fires immediately and the camera-open call adds a second chance —
      // the 10-30s face-detection window is plenty for GPS to arrive.
      setLocation(null);
      acquireLocation();
      // Await the authoritative status refresh before re-enabling the button
      await fetchStatus();
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
    withinGeoFence, geoFenceInfo,
  };
}
