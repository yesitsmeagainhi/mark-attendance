/**
 * Today's punch sequence as the punch screen should see it.
 *
 * A miss-punch request that is still waiting for admin approval counts as
 * that punch when deciding what the next punch is. Without this, an employee
 * who forgot to punch in and filed a miss punch-in would have their evening
 * punch saved as another punch-in, and need a second request for the
 * punch-out. Nothing is written for pending requests: approval still inserts
 * the real record, and rejection leaves the day as it was.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { missPunchRequests } from "../db/schema";
import { istToUTC } from "./time-utils";
import { addDays } from "./week-off";

export type PendingPunch = {
  punchType: "IN" | "OUT";
  /** UTC "YYYY-MM-DD HH:MM:SS", same format as attendance.server_timestamp */
  serverTimestamp: string;
  requestId: string;
};

function utcNow(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Pending miss-punch requests that fall on `utcDate` (the same day key the
 * punch screen uses) and whose requested time has already passed.
 */
export function pendingMissPunchesForDay(employeeId: string, utcDate: string): PendingPunch[] {
  // Requests carry the IST date; an IST date is the UTC date or the day after
  const rows = getDb()
    .select({ id: missPunchRequests.id, date: missPunchRequests.date, punchType: missPunchRequests.punchType, requestedTime: missPunchRequests.requestedTime })
    .from(missPunchRequests)
    .where(and(
      eq(missPunchRequests.employeeId, employeeId),
      eq(missPunchRequests.status, "pending"),
      inArray(missPunchRequests.date, [utcDate, addDays(utcDate, 1)]),
    ))
    .all();

  const now = utcNow();
  return rows
    .map((r) => ({ punchType: r.punchType, serverTimestamp: istToUTC(r.date, r.requestedTime), requestId: r.id }))
    .filter((p) => p.serverTimestamp.slice(0, 10) === utcDate && p.serverTimestamp <= now)
    .sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
}

/** Recorded punches plus pending ones, in time order. Pending entries carry `pending: true`. */
export function withPendingPunches<T extends { punchType: string; serverTimestamp: string }>(
  recorded: T[],
  pending: PendingPunch[],
): (T | (PendingPunch & { pending: true }))[] {
  return [...recorded, ...pending.map((p) => ({ ...p, pending: true as const }))]
    .sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));
}
