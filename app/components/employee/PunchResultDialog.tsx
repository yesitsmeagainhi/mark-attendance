"use client";

import { formatTimeIST } from "../../../lib/time-utils";
import type { GeoAlert, PunchResult } from "../../hooks/useAttendanceCamera";

/**
 * Shown on whichever tab the employee punched from (Home or Attendance), so a
 * rejected punch can't go unnoticed: while saving, then success or failure.
 */
export default function PunchResultDialog({ saving, result, geoAlert, onClose }: {
  saving: boolean;
  result: PunchResult | null;
  geoAlert: GeoAlert | null;
  onClose: () => void;
}) {
  if (saving) {
    return (
      <div className="geo-alert-overlay">
        <div className="geo-alert-card">
          <div className="geo-alert-icon" style={{ color: "#6d45e5" }}>&#8987;</div>
          <h3>Saving your attendance...</h3>
          <p className="geo-alert-sub">Please don&apos;t close the app until this finishes.</p>
        </div>
      </div>
    );
  }
  if (!result) return null;

  const label = result.punchType === "IN" ? "Punch in" : "Punch out";
  return (
    <div className="geo-alert-overlay" onClick={onClose}>
      <div className="geo-alert-card" onClick={(e) => e.stopPropagation()}>
        {result.ok ? (
          <>
            <div className="geo-alert-icon" style={{ color: "#168052" }}>&#10003;</div>
            <h3>{label} saved</h3>
            {result.time && <p>Recorded at <b>{formatTimeIST(result.time)}</b>.</p>}
            <p className="geo-alert-sub">{result.text}</p>
          </>
        ) : (
          <>
            <div className="geo-alert-icon">&#9888;</div>
            <h3>{label} NOT saved</h3>
            {geoAlert ? (
              <>
                <p>You are <b>{geoAlert.distance >= 1000 ? `${(geoAlert.distance / 1000).toFixed(1)} km` : `${geoAlert.distance} m`}</b> away from <b>{geoAlert.branchName}</b>.</p>
                <p className="geo-alert-sub">Allowed range is <b>{geoAlert.allowedRadius} m</b>. Please move closer and try again.</p>
              </>
            ) : (
              <p>{result.text}</p>
            )}
            <p className="geo-alert-sub">Your attendance is not marked until you see &quot;saved&quot;.</p>
          </>
        )}
        <button className="primary" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}
