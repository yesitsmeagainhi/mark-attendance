/**
 * Salary rules shared by the payroll and reports APIs.
 *
 * Callers classify each day (present / half / absent / leave / …) the way they
 * always have; this module turns those counts plus the employee's effective
 * rules into money. With the default rules the result is identical to the
 * calculation that existed before configurable rules.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import { leaveRequests } from "../db/schema";
import { getHolidayCalendar } from "./holidays";
import { addDays, dayOfWeek, eachDate } from "./week-off";
import { timeToMinutes } from "./time-utils";
import type { RuleValues } from "./rules";

export type LeaveType = "sick" | "casual" | "earned";
export const LEAVE_TYPES: LeaveType[] = ["sick", "casual", "earned"];

/** Shift length in minutes; handles overnight shifts (end before start). */
export function shiftLengthMinutes(start: string, end: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return 480;
  let diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

/** Minutes past midnight in India for a stored UTC timestamp ("YYYY-MM-DD HH:MM:SS"). */
export function istMinutesOfDay(ts: string): number {
  const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
  return ((d.getUTCHours() + 5) * 60 + d.getUTCMinutes() + 30) % (24 * 60);
}

/**
 * "Late by this much = half day" rule: true when the first punch-in of the day
 * is at least `late_half_day_minutes` after the shift start. 0 = rule off.
 * Not for flexible-hours staff (callers skip them, as for late marks).
 */
export function isLateHalfDay(punchInTs: string | null | undefined, workStartTime: string, rules: RuleValues): boolean {
  if (!punchInTs || !(rules.late_half_day_minutes > 0) || !/^\d{1,2}:\d{2}$/.test(workStartTime)) return false;
  return istMinutesOfDay(punchInTs) - timeToMinutes(workStartTime) >= rules.late_half_day_minutes;
}

/** Paid working minutes in a shift: shift length minus its unpaid break (never under 1 hour). */
export function workingMinutesPerShift(shiftMinutes: number, rules: RuleValues): number {
  return Math.max(60, shiftMinutes - rules.shift_break_minutes);
}

/**
 * Overtime earned on one completed working day.
 *
 * `workedMinutes` is punched-in time (breaks the employee punched out for are
 * already excluded). If they punched out for less than the shift's unpaid
 * break, the rest of the break is assumed taken, so staff who punch out for
 * lunch and staff who don't are treated the same.
 */
export function dailyOvertimeMinutes(workedMinutes: number, punchedBreakMinutes: number, shiftMinutes: number, rules: RuleValues): number {
  if (!rules.overtime_enabled) return 0;
  const unpunchedBreak = Math.max(0, rules.shift_break_minutes - punchedBreakMinutes);
  const extra = workedMinutes - unpunchedBreak - workingMinutesPerShift(shiftMinutes, rules);
  return extra > 0 && extra >= rules.overtime_min_minutes ? extra : 0;
}

function quotaFor(rules: RuleValues, type: LeaveType): number {
  return type === "sick" ? rules.leave_sick_quota : type === "casual" ? rules.leave_casual_quota : rules.leave_earned_quota;
}

function isPaidType(rules: RuleValues, type: LeaveType): boolean {
  return type === "sick" ? rules.leave_sick_paid : type === "casual" ? rules.leave_casual_paid : rules.leave_earned_paid;
}

export type LeaveUsage = Record<LeaveType, number>;

const emptyUsage = (): LeaveUsage => ({ sick: 0, casual: 0, earned: 0 });

/**
 * Leave days of each type already taken in the calendar year before `monthStart`.
 * Holidays and Sundays don't consume leave. (Within the month being paid, the
 * exact week-off resolution is used instead.)
 */
export function leaveUsedBeforeMonth(employeeIds: string[], monthStart: string): Map<string, LeaveUsage> {
  const result = new Map<string, LeaveUsage>();
  for (const id of employeeIds) result.set(id, emptyUsage());
  const yearStart = `${monthStart.slice(0, 4)}-01-01`;
  if (monthStart <= yearStart || employeeIds.length === 0) return result;
  const lastPrior = addDays(monthStart, -1);

  const rows = getDb()
    .select({ employeeId: leaveRequests.employeeId, leaveType: leaveRequests.leaveType, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.status, "approved"),
      inArray(leaveRequests.employeeId, employeeIds),
      lte(leaveRequests.fromDate, lastPrior),
      gte(leaveRequests.toDate, yearStart),
    ))
    .orderBy(leaveRequests.fromDate)
    .all();
  if (rows.length === 0) return result;

  const holidayDates = getHolidayCalendar(yearStart, lastPrior).dates;
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const usage = result.get(r.employeeId);
    if (!usage) continue;
    if (!seen.has(r.employeeId)) seen.set(r.employeeId, new Set());
    const empSeen = seen.get(r.employeeId)!;
    const from = r.fromDate > yearStart ? r.fromDate : yearStart;
    const to = r.toDate < lastPrior ? r.toDate : lastPrior;
    for (const d of eachDate(from, to)) {
      if (empSeen.has(d) || holidayDates.has(d) || dayOfWeek(d) === 0) continue;
      empSeen.add(d);
      usage[r.leaveType]++;
    }
  }
  return result;
}

/**
 * Split this month's leave days into paid and unpaid using the leave policy.
 * Days are consumed in date order against the remaining yearly quota.
 */
export function splitLeaveDays(
  dates: string[],
  typeOf: (date: string) => LeaveType,
  usedBefore: LeaveUsage,
  rules: RuleValues,
): { paid: number; unpaid: number; unpaidDates: Set<string> } {
  const used = { ...usedBefore };
  const unpaidDates = new Set<string>();
  for (const d of [...dates].sort()) {
    const type = typeOf(d);
    const quota = quotaFor(rules, type);
    if (!isPaidType(rules, type) || (quota > 0 && used[type] >= quota)) {
      unpaidDates.add(d);
    } else {
      used[type]++;
    }
  }
  return { paid: dates.length - unpaidDates.size, unpaid: unpaidDates.size, unpaidDates };
}

/**
 * Which approved leave days between `from` and `to` are unpaid under the leave
 * policy (the "paid" switch per type and the yearly quota), worked out month by
 * month exactly like the salary. Holidays never count as leave; week-offs are
 * taken from `isWeekOff` (undefined = not known for that date → Sundays).
 * Used by the employee's History and Timesheet so they match the payslip.
 */
export function unpaidLeaveDates(
  employeeId: string,
  from: string,
  to: string,
  rules: RuleValues,
  isWeekOff: (date: string) => boolean | undefined,
): Set<string> {
  const unpaid = new Set<string>();
  if (from > to) return unpaid;
  let month = from.slice(0, 7);
  while (month <= to.slice(0, 7)) {
    const [y, m] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const rows = getDb()
      .select({ leaveType: leaveRequests.leaveType, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.fromDate, monthEnd),
        gte(leaveRequests.toDate, monthStart),
      ))
      .orderBy(leaveRequests.fromDate)
      .all();
    if (rows.length > 0) {
      const holidays = getHolidayCalendar(monthStart, monthEnd).dates;
      const typeByDate = new Map<string, LeaveType>();
      for (const r of rows) {
        for (const d of eachDate(r.fromDate > monthStart ? r.fromDate : monthStart, r.toDate < monthEnd ? r.toDate : monthEnd)) {
          const off = isWeekOff(d) ?? dayOfWeek(d) === 0;
          if (holidays.has(d) || off || typeByDate.has(d)) continue;
          typeByDate.set(d, r.leaveType);
        }
      }
      const used = leaveUsedBeforeMonth([employeeId], monthStart).get(employeeId)!;
      for (const d of splitLeaveDays([...typeByDate.keys()], (d) => typeByDate.get(d)!, used, rules).unpaidDates) {
        if (d >= from && d <= to) unpaid.add(d);
      }
    }
    month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return unpaid;
}

/**
 * Extra pay credit for working on the week-off, by hours worked that day:
 * a full day's work earns 1 day's pay, a half day's work ½, less than that 0.
 * Same thresholds as ordinary attendance (minimum hours for full / half day).
 */
export function weekOffWorkedCredit(workedMinutes: number, rules: RuleValues): 0 | 0.5 | 1 {
  if (workedMinutes >= rules.minimum_hours_for_full_day * 60) return 1;
  if (workedMinutes >= rules.minimum_hours_for_half_day * 60) return 0.5;
  return 0;
}

export type SalaryInput = {
  monthlySalary: number;
  daysInMonth: number;
  shiftMinutes: number;
  rules: RuleValues;
  absentDays: number;
  halfDays: number;
  /** Of the half days, how many came from the "late by this much = half day" rule */
  lateHalfDays?: number;
  lateDays: number;
  unpaidHolidayDays: number;
  unpaidLeaveDays: number;
  /** Week-off days the employee worked (count, for display) */
  weekOffWorkedDays: number;
  /**
   * Days of extra pay earned on those days: 1 per full day, ½ per half day,
   * 0 below half-day hours (see weekOffWorkedCredit). Defaults to
   * weekOffWorkedDays (1 each) when a caller doesn't supply it.
   */
  weekOffWorkedCredit?: number;
  /** Of the worked week-off days, how many earned only half a day */
  weekOffWorkedHalfDays?: number;
  overtimeMinutes: number;
};

/** Exact per-day pay: salary ÷ calendar days in the month (week-offs included). */
function exactDayRate(i: SalaryInput): number {
  return i.daysInMonth > 0 ? i.monthlySalary / i.daysInMonth : 0;
}

export type SalaryBreakdown = {
  perDayRate: number;
  /** Days deducted because of late marks */
  lateDeductionDays: number;
  /** Fixed ₹ fine for late marks */
  lateFine: number;
  halfDayDeductionDays: number;
  unpaidLeaveDays: number;
  /** Total days deducted (absent + half days + late + unpaid holidays + unpaid leave) */
  deductionDays: number;
  /** Total ₹ deducted, including the late fine */
  deduction: number;
  weekOffBonus: number;
  overtimeMinutes: number;
  overtimeHours: number;
  overtimeHourlyRate: number;
  overtimePay: number;
  netPay: number;
};

export type SalaryLine = {
  label: string;
  /** How the amount was worked out, e.g. "3 days × ₹1,000" */
  detail: string;
  /** Short calculation for payslips, e.g. "17 days × ₹1,035" */
  note?: string;
  /** Signed ₹ amount: negative = deduction, positive = extra pay, 0 = info only */
  amount: number;
  kind: "base" | "deduction" | "extra" | "info";
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
/** Per-day rate with paise when it isn't whole, e.g. ₹806.45 */
const inrRate = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const hm = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;

/**
 * Line-by-line explanation of a salary, showing every rule that applied.
 * Lines with nothing to apply are left out. Amounts are rounded per line, so
 * they can differ from the total deduction by a rupee.
 */
export function salaryLines(i: SalaryInput, b: SalaryBreakdown): SalaryLine[] {
  const r = i.rules;
  // Exact rate (not rounded first), so each line is days × salary ÷ days-in-month
  const rate = exactDayRate(i);
  const lines: SalaryLine[] = [
    { label: "Monthly salary", detail: `Per-day rate ${inrRate(rate)} (salary ÷ ${i.daysInMonth} days)`, amount: i.monthlySalary, kind: "base" },
  ];
  const dayLine = (label: string, days: number, note: string) => {
    if (days > 0) lines.push({ label, detail: `${note}${note ? " → " : ""}${plural(days, "day")} × ${inrRate(rate)}`, note: `${plural(days, "day")} × ${inrRate(rate)}`, amount: -Math.round(days * rate), kind: "deduction" });
  };

  dayLine("Absent days", i.absentDays, "Includes short days and missed punch-outs");
  const lateHalf = i.lateHalfDays ? ` (${i.lateHalfDays} for coming in ${r.late_half_day_minutes}+ min late)` : "";
  dayLine("Half days", b.halfDayDeductionDays, i.halfDays > 0 ? `${plural(i.halfDays, "half day")}${lateHalf} × ${r.half_day_deduction} day` : "");
  if (i.lateDays > 0) {
    if (r.late_to_absent_count > 0) {
      const blocks = Math.floor(i.lateDays / r.late_to_absent_count);
      if (b.lateDeductionDays > 0) {
        dayLine("Late marks", b.lateDeductionDays, `${plural(i.lateDays, "late mark")}: every ${r.late_to_absent_count} = ${r.late_penalty_days} day, ${blocks} × ${r.late_penalty_days}`);
      } else {
        lines.push({ label: "Late marks", detail: `${plural(i.lateDays, "late mark")}, below the ${r.late_to_absent_count} needed for a deduction`, amount: 0, kind: "info" });
      }
    } else if (r.late_fine_amount <= 0) {
      lines.push({ label: "Late marks", detail: `${plural(i.lateDays, "late mark")}, late penalty is off`, amount: 0, kind: "info" });
    }
    if (b.lateFine > 0) lines.push({ label: "Late fine", detail: `${plural(i.lateDays, "late mark")} × ${inr(r.late_fine_amount)}`, note: `${plural(i.lateDays, "late mark")} × ${inr(r.late_fine_amount)}`, amount: -b.lateFine, kind: "deduction" });
  }
  dayLine("Unpaid leave", i.unpaidLeaveDays, "Beyond the yearly quota or an unpaid leave type");
  dayLine("Unpaid holidays", i.unpaidHolidayDays, "");
  if (b.weekOffBonus > 0) {
    const credit = i.weekOffWorkedCredit ?? i.weekOffWorkedDays;
    const half = i.weekOffWorkedHalfDays ?? 0;
    const full = Math.round(credit - half * 0.5);
    const parts = [full > 0 ? `${plural(full, "full day")}` : "", half > 0 ? `${plural(half, "half day")}` : ""].filter(Boolean).join(" + ");
    const creditText = `${credit} ${credit === 1 ? "day" : "days"}`;
    lines.push({
      label: "Week-off worked",
      detail: `${parts} on the week-off (full / half by hours worked) → ${creditText} × ${inrRate(rate)}`,
      note: `${creditText} × ${inrRate(rate)}`,
      amount: b.weekOffBonus,
      kind: "extra",
    });
  } else if (i.weekOffWorkedDays > 0) {
    lines.push({ label: "Week-off worked", detail: `${plural(i.weekOffWorkedDays, "day")} on the week-off, under half-day hours: no extra pay`, amount: 0, kind: "info" });
  }
  if (r.overtime_enabled) {
    if (b.overtimeMinutes > 0) {
      const capped = b.overtimeMinutes < i.overtimeMinutes ? ` (capped at ${r.overtime_max_hours_month} h; worked ${hm(i.overtimeMinutes)})` : "";
      const workH = workingMinutesPerShift(i.shiftMinutes, r) / 60;
      const rateText = `₹${b.overtimeHourlyRate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/h`;
      lines.push({ label: "Overtime", detail: `${hm(b.overtimeMinutes)} × ${rateText} (per-day pay ÷ ${workH} working h) × ${r.overtime_rate_multiplier}${capped}`, note: `${hm(b.overtimeMinutes)} at ${r.overtime_rate_multiplier}× of ${rateText}`, amount: b.overtimePay, kind: "extra" });
    } else {
      lines.push({ label: "Overtime", detail: `None this month (needs ${r.overtime_min_minutes}+ min beyond ${hm(workingMinutesPerShift(i.shiftMinutes, r))} of work on a day)`, amount: 0, kind: "info" });
    }
  }
  return lines;
}

export function computeMonthlySalary(i: SalaryInput): SalaryBreakdown {
  const r = i.rules;
  // Per-day rate = salary ÷ total calendar days in the month (week-offs included).
  // Money is worked out with the exact rate and rounded only at the end; rounding
  // the rate first was off by a few rupees (e.g. ₹25,000 / 31 = ₹806.45, not ₹806).
  const rate = exactDayRate(i);
  const perDayRate = Math.round(rate * 100) / 100; // for display

  const lateDeductionDays = r.late_to_absent_count > 0
    ? Math.floor(i.lateDays / r.late_to_absent_count) * r.late_penalty_days
    : 0;
  const lateFine = Math.round(i.lateDays * r.late_fine_amount);
  const halfDayDeductionDays = i.halfDays * r.half_day_deduction;

  const deductionDays = i.absentDays + halfDayDeductionDays + lateDeductionDays + i.unpaidHolidayDays + i.unpaidLeaveDays;
  const deduction = Math.round(rate * deductionDays) + lateFine;
  // Full or half day's pay per worked week-off day, by hours worked that day
  const weekOffBonus = Math.round((i.weekOffWorkedCredit ?? i.weekOffWorkedDays) * rate);

  const capMinutes = r.overtime_max_hours_month > 0 ? r.overtime_max_hours_month * 60 : Infinity;
  const overtimeMinutes = r.overtime_enabled ? Math.min(i.overtimeMinutes, capMinutes) : 0;
  // Hourly rate = exact per-day pay ÷ working hours (not the rounded per-day rate)
  const overtimeHourlyRate = i.daysInMonth > 0 && i.shiftMinutes > 0
    ? i.monthlySalary / i.daysInMonth / (workingMinutesPerShift(i.shiftMinutes, r) / 60)
    : 0;
  const overtimePay = Math.round((overtimeMinutes / 60) * overtimeHourlyRate * r.overtime_rate_multiplier);

  const netPay = Math.max(0, i.monthlySalary - deduction + weekOffBonus + overtimePay);

  return {
    perDayRate,
    lateDeductionDays,
    lateFine,
    halfDayDeductionDays,
    unpaidLeaveDays: i.unpaidLeaveDays,
    deductionDays,
    deduction,
    weekOffBonus,
    overtimeMinutes,
    overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
    overtimeHourlyRate,
    overtimePay,
    netPay,
  };
}
