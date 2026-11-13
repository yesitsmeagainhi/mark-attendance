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

/** Overtime earned on one completed working day. */
export function dailyOvertimeMinutes(workedMinutes: number, shiftMinutes: number, rules: RuleValues): number {
  if (!rules.overtime_enabled) return 0;
  const extra = workedMinutes - shiftMinutes;
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

export type SalaryInput = {
  monthlySalary: number;
  daysInMonth: number;
  shiftMinutes: number;
  rules: RuleValues;
  absentDays: number;
  halfDays: number;
  lateDays: number;
  unpaidHolidayDays: number;
  unpaidLeaveDays: number;
  weekOffWorkedDays: number;
  overtimeMinutes: number;
};

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

export function computeMonthlySalary(i: SalaryInput): SalaryBreakdown {
  const r = i.rules;
  // Per-day rate uses total calendar days in month (including week-offs)
  const perDayRate = Math.round(i.monthlySalary / i.daysInMonth);

  const lateDeductionDays = r.late_to_absent_count > 0
    ? Math.floor(i.lateDays / r.late_to_absent_count) * r.late_penalty_days
    : 0;
  const lateFine = Math.round(i.lateDays * r.late_fine_amount);
  const halfDayDeductionDays = i.halfDays * r.half_day_deduction;

  const deductionDays = i.absentDays + halfDayDeductionDays + lateDeductionDays + i.unpaidHolidayDays + i.unpaidLeaveDays;
  const deduction = Math.round(perDayRate * deductionDays) + lateFine;
  const weekOffBonus = Math.round(i.weekOffWorkedDays * perDayRate);

  const capMinutes = r.overtime_max_hours_month > 0 ? r.overtime_max_hours_month * 60 : Infinity;
  const overtimeMinutes = r.overtime_enabled ? Math.min(i.overtimeMinutes, capMinutes) : 0;
  const overtimeHourlyRate = i.shiftMinutes > 0 ? perDayRate / (i.shiftMinutes / 60) : 0;
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
    overtimeHourlyRate: Math.round(overtimeHourlyRate * 100) / 100,
    overtimePay,
    netPay,
  };
}
