"use client";

import { getIST } from "../../../lib/time-utils";
import type { TodayStatus } from "./attendance-types";

function to12h(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * True when a punch now is probably meant as a punch-out from a day the
 * employee forgot to punch in: nothing punched (or requested) today, and it's
 * already past the middle of their shift. Flexible staff are left out: they
 * punch many sessions a day, so the time says nothing.
 */
export function looksLikeForgottenPunchIn(status: TodayStatus | null): boolean {
  if (!status || status.flexibleHours) return false;
  if (status.nextPunchType !== "IN" || (status.punches?.length ?? 0) > 0) return false;
  const [sh, sm] = (status.workStartTime || "09:00").split(":").map(Number);
  const [eh, em] = (status.workEndTime || "18:00").split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (!(end > start)) return false;
  const { hours, minutes } = getIST();
  return hours * 60 + minutes >= start + (end - start) / 2;
}

/** Asks "did you forget to punch in?" before a late first punch of the day. */
export default function ForgotPunchInDialog({
  status,
  onRequestPunchIn,
  onPunchInNow,
  onClose,
}: {
  status: TodayStatus;
  onRequestPunchIn: () => void;
  onPunchInNow: () => void;
  onClose: () => void;
}) {
  const now = getIST().timeStr;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="forgot-in-title" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header" style={{ marginBottom: 12 }}>
          <h2 id="forgot-in-title">Did you forget to punch in?</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink)", margin: "0 0 8px" }}>
          It&apos;s <b>{now}</b> and there&apos;s no punch-in for today. Your shift started at <b>{to12h(status.workStartTime)}</b>.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 18px" }}>
          If you were at work, request the missed punch-in first. Then this punch is saved as your <b>punch-out</b>, and you won&apos;t need a second request.
        </p>
        <button type="button" className="primary" style={{ margin: 0 }} onClick={onRequestPunchIn}>
          Yes, request punch-in
        </button>
        <button type="button" className="secondary" style={{ marginTop: 10 }} onClick={onPunchInNow}>
          No, I&apos;m starting work now
        </button>
      </div>
    </div>
  );
}
