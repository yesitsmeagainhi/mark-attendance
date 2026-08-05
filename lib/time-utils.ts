/** Parse "HH:MM" to minutes since midnight */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Format minutes as "Xh Ym" */
export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Format an ISO/SQLite timestamp to "hh:mm AM/PM" in IST */
export function formatTimeIST(timestamp: string): string {
  const d = new Date(timestamp.replace(" ", "T") + (timestamp.includes("Z") || timestamp.includes("+") ? "" : "Z"));
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

/** Get current IST date/time parts */
export function getIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return {
    hours: ist.getHours(),
    minutes: ist.getMinutes(),
    dateStr: ist.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }),
    timeStr: ist.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }),
    fullDateStr: ist.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
  };
}

/** Get greeting based on hour */
export function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Convert a date string (YYYY-MM-DD) and IST time (HH:MM) to a UTC timestamp
 * string suitable for storing in server_timestamp.
 * E.g. istToUTC("2026-08-04", "09:15") → "2026-08-04 03:45:00"
 */
export function istToUTC(date: string, istTime: string): string {
  const [h, m] = istTime.split(":").map(Number);
  // IST is UTC+5:30, so subtract 330 minutes
  let totalMin = h * 60 + m - 330;
  let dateObj = new Date(date + "T00:00:00Z");
  if (totalMin < 0) {
    totalMin += 1440;
    dateObj.setUTCDate(dateObj.getUTCDate() - 1);
  }
  const utcH = Math.floor(totalMin / 60);
  const utcM = totalMin % 60;
  const utcDate = dateObj.toISOString().slice(0, 10);
  return `${utcDate} ${String(utcH).padStart(2, "0")}:${String(utcM).padStart(2, "0")}:00`;
}

/** Compute grace period status */
export function getGraceStatus(punchInTime: string, workStartTime: string): { label: string; className: string } {
  const punchDate = new Date(punchInTime.replace(" ", "T") + (punchInTime.includes("Z") || punchInTime.includes("+") ? "" : "Z"));
  const punchIST = new Date(punchDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const punchMinutes = punchIST.getHours() * 60 + punchIST.getMinutes();
  const startMinutes = timeToMinutes(workStartTime);
  const graceDeadline = startMinutes + 15;

  if (punchMinutes <= startMinutes) return { label: "On time", className: "on-time" };
  if (punchMinutes <= graceDeadline) return { label: "Within grace period", className: "grace" };
  const lateBy = punchMinutes - startMinutes;
  return { label: `Late by ${formatDuration(lateBy)}`, className: "late" };
}
