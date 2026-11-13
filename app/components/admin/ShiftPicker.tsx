"use client";

import { useEffect, useState } from "react";
import type { ShiftRow } from "./types";

/**
 * Shift template dropdown for the employee forms. Picking a shift fills the
 * IN/OUT timings; "Custom timings" leaves them editable by hand.
 */
export default function ShiftPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (shift: ShiftRow | null) => void;
}) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
function formatTime12(time: string | null | undefined): string {
  if (!time) return "";

  const [hours, minutes] = time.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
  useEffect(() => {
    fetch("/api/admin/shifts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.shifts) setShifts(data.shifts); })
      .catch(() => undefined);
  }, []);

  if (shifts.length === 0) return null;

  return (
    <label>
      <span>Shift</span>
      <select
        value={value}
        onChange={(e) => onPick(shifts.find((s) => s.id === e.target.value) ?? null)}
      >
        <option value="">Custom timings</option>
        {shifts.map((s) => (
          <option key={s.id} value={s.id}>{s.name} ({formatTime12(s.startTime)}–{formatTime12(s.endTime)})</option>
        ))}
      </select>
    </label>
  );
}
