/**
 * Automatic payslip schedule.
 *
 *  - On the 1st of each month, last month's payslips are published.
 *  - On the withdrawal day (15th unless the admin changes it), those payslips
 *    are withdrawn again. Withdrawal day 0 = never withdraw automatically.
 *
 * Each step runs once per month (remembered in app_settings), so an admin's
 * manual Publish / Re-publish / Withdraw is never undone by the schedule.
 * It runs hourly in the server process (instrumentation.ts) and again
 * whenever payslips are opened, so a missed hour just catches up.
 */
import { inArray, like } from "drizzle-orm";
import { getDb } from "../db";
import { appSettings } from "../db/schema";
import { logActivity } from "./activity-logger";
import { monthLabel, payslipMonthStatus, publishPayslips, unpublishPayslips } from "./payslips";

const AUTO_KEY = "payslip_auto_enabled";
const PUBLISHED = "payslip_auto_published:"; // + YYYY-MM → ISO time
const WITHDRAWN = "payslip_auto_withdrawn:"; // + YYYY-MM → ISO time
const WITHDRAW_DAY_KEY = "payslip_withdraw_day";
/** Default day of the month payslips are withdrawn on */
export const DEFAULT_WITHDRAW_DAY = 15;
/** Allowed withdrawal days: 2nd–28th (every month has a 28th), or 0 = never */
export const MIN_WITHDRAW_DAY = 2;
export const MAX_WITHDRAW_DAY = 28;

export function isValidWithdrawDay(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && (n === 0 || (n >= MIN_WITHDRAW_DAY && n <= MAX_WITHDRAW_DAY));
}

function setSetting(key: string, value: string) {
  const now = new Date().toISOString();
  getDb().insert(appSettings).values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } }).run();
}

export function isAutoPayslipsEnabled(): boolean {
  const row = getDb().select().from(appSettings).where(inArray(appSettings.key, [AUTO_KEY])).get();
  return row ? row.value !== "false" : true; // on unless switched off
}

export function setAutoPayslipsEnabled(enabled: boolean) {
  setSetting(AUTO_KEY, enabled ? "true" : "false");
}

/** Day of the month the automatic withdrawal happens; 0 = never withdraw automatically. */
export function getWithdrawDay(): number {
  const row = getDb().select().from(appSettings).where(inArray(appSettings.key, [WITHDRAW_DAY_KEY])).get();
  const n = row ? Number(row.value) : DEFAULT_WITHDRAW_DAY;
  return isValidWithdrawDay(n) ? n : DEFAULT_WITHDRAW_DAY;
}

export function setWithdrawDay(day: number) {
  if (!isValidWithdrawDay(day)) throw new Error("Invalid withdrawal day");
  setSetting(WITHDRAW_DAY_KEY, String(day));
}

/** "15th", "2nd", "23rd" */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** Today's date in India as { month: "YYYY-MM", day } */
function todayIST(now: Date) {
  const d = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return { month: d.slice(0, 7), day: Number(d.slice(8, 10)) };
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** When a month's payslips are (or were) shown automatically. withdrawOn is null when they are never withdrawn. */
export function autoWindow(month: string, withdrawDay = getWithdrawDay()) {
  const after = nextMonth(month);
  return {
    withdrawDay,
    publishOn: `${after}-01`,
    withdrawOn: withdrawDay ? `${after}-${String(withdrawDay).padStart(2, "0")}` : null,
  };
}

/** What the schedule has already done for a month. */
export function autoMonthState(month: string) {
  const rows = getDb().select().from(appSettings).where(inArray(appSettings.key, [PUBLISHED + month, WITHDRAWN + month])).all();
  return {
    autoPublishedAt: rows.find((r) => r.key === PUBLISHED + month)?.value ?? null,
    autoWithdrawnAt: rows.find((r) => r.key === WITHDRAWN + month)?.value ?? null,
  };
}

/** Run any step that is due. Safe to call often. */
export function runPayslipSchedule(now = new Date()): { published?: string; withdrawn: string[] } {
  const result: { published?: string; withdrawn: string[] } = { withdrawn: [] };
  if (!isAutoPayslipsEnabled()) return result;
  const { month: current, day } = todayIST(now);
  const last = previousMonth(current);
  const stamp = now.toISOString();
  const withdrawDay = getWithdrawDay();
  const until = withdrawDay ? ` (shown until the ${ordinal(withdrawDay)})` : "";

  // From the 1st until the day before the withdrawal day: publish last month (once)
  if ((withdrawDay === 0 || day < withdrawDay) && !autoMonthState(last).autoPublishedAt) {
    // An admin may already have published it by hand; it still gets withdrawn on the withdrawal day
    const already = payslipMonthStatus(last).published;
    const count = already ? payslipMonthStatus(last).count : publishPayslips(last, "system");
    setSetting(PUBLISHED + last, stamp);
    if (!already) {
      result.published = last;
      logActivity({
        actionType: "payslips_published",
        performedBy: "system",
        performedByName: "Automatic",
        targetId: last,
        targetName: monthLabel(last),
        description: `${monthLabel(last)} payslips published automatically for ${count} employees${until}`,
        metadata: { month: last, count, auto: true },
      });
    }
  }

  // Never withdrawn automatically
  if (withdrawDay === 0) return result;

  // From the withdrawal day: withdraw every auto-published month that is due and not yet withdrawn (once)
  const marked = getDb().select().from(appSettings).where(like(appSettings.key, `${PUBLISHED}%`)).all();
  for (const row of marked) {
    const month = row.key.slice(PUBLISHED.length);
    const due = month < last || (month === last && day >= withdrawDay);
    if (!due || autoMonthState(month).autoWithdrawnAt) continue;
    const removed = unpublishPayslips(month);
    setSetting(WITHDRAWN + month, stamp);
    result.withdrawn.push(month);
    logActivity({
      actionType: "payslips_unpublished",
      performedBy: "system",
      performedByName: "Automatic",
      targetId: month,
      targetName: monthLabel(month),
      description: `${monthLabel(month)} payslips withdrawn automatically on the ${ordinal(withdrawDay)} (${removed} employees)`,
      metadata: { month, removed, auto: true },
    });
  }
  return result;
}

/** Same as runPayslipSchedule, but never throws (used from request handlers and the timer). */
export function runPayslipScheduleSafely() {
  try {
    return runPayslipSchedule();
  } catch (err) {
    console.error("[payslip schedule]", err);
    return { withdrawn: [] };
  }
}
