"use client";

import { formatTimeIST } from "../../../lib/time-utils";
import type { TodayStatus } from "./attendance-types";

/**
 * Tells the employee that a miss-punch request for today is still waiting for
 * admin approval and already counts as that punch.
 */
export default function PendingPunchNotice({ todayStatus }: { todayStatus: TodayStatus | null }) {
  const pending = todayStatus?.pendingPunches ?? [];
  if (pending.length === 0) return null;

  const list = pending.map((p) => `punch-${p.type === "IN" ? "in" : "out"} at ${formatTimeIST(p.time)}`).join(", ");
  const next = todayStatus?.nextPunchType;
  const hint = next === "OUT" ? " It already counts, so just punch out when you leave."
    : next === "IN" ? " It already counts, so your next punch is a punch-in."
      : "";

  return (
    <div
      role="status"
      style={{
        background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 12,
        padding: "12px 14px", fontSize: 14, lineHeight: 1.5, marginBottom: 16,
      }}
    >
      <b>Miss punch awaiting approval:</b> your {list} is waiting for the admin to approve.{hint}
    </div>
  );
}

/** Small tag shown next to a punch time that comes from a pending miss-punch request. */
export function PendingTag() {
  return (
    <span style={{ display: "inline-block", marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#c2410c", background: "#ffedd5", borderRadius: 6, padding: "1px 6px", verticalAlign: "middle" }}>
      Awaiting approval
    </span>
  );
}
