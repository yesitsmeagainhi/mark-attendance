/**
 * Automatic payslip schedule.
 *
 *  - On the 1st of each month, last month's payslips are published.
 *  - On the 15th, those payslips are withdrawn again.
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
export const WITHDRAW_DAY = 15;

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

/** When a month's payslips are (or were) shown automatically. */
export function autoWindow(month: string) {
  const after = nextMonth(month);
  return { publishOn: `${after}-01`, withdrawOn: `${after}-${String(WITHDRAW_DAY).padStart(2, "0")}` };
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

  // 1st–14th: publish last month (once)
  if (day < WITHDRAW_DAY && !autoMonthState(last).autoPublishedAt) {
    // An admin may already have published it by hand; it still gets withdrawn on the 15th
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
        description: `${monthLabel(last)} payslips published automatically for ${count} employees (shown until the ${WITHDRAW_DAY}th)`,
        metadata: { month: last, count, auto: true },
      });
    }
  }

  // From the 15th: withdraw every auto-published month that is due and not yet withdrawn (once)
  const marked = getDb().select().from(appSettings).where(like(appSettings.key, `${PUBLISHED}%`)).all();
  for (const row of marked) {
    const month = row.key.slice(PUBLISHED.length);
    const due = month < last || (month === last && day >= WITHDRAW_DAY);
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
      description: `${monthLabel(month)} payslips withdrawn automatically on the ${WITHDRAW_DAY}th (${removed} employees)`,
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
