import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { attendanceRules, employeeRuleOverrides } from "../db/schema";

export type RuleValues = {
  grace_period: number;
  lunch_break_enabled: boolean;
  lunch_break_min_hours: number;
  late_to_absent_count: number;
  minimum_hours_for_half_day: number;
  minimum_hours_for_full_day: number;
  // Penalties
  late_penalty_days: number;
  late_fine_amount: number;
  half_day_deduction: number;
  // Overtime
  overtime_enabled: boolean;
  overtime_min_minutes: number;
  overtime_rate_multiplier: number;
  overtime_max_hours_month: number;
  // Leave policy (quota 0 = unlimited)
  leave_sick_quota: number;
  leave_sick_paid: boolean;
  leave_casual_quota: number;
  leave_casual_paid: boolean;
  leave_earned_quota: number;
  leave_earned_paid: boolean;
};

/** Defaults reproduce the salary calculation used before the payroll rules existed. */
export const DEFAULT_RULES: RuleValues = {
  grace_period: 15,
  lunch_break_enabled: false,
  lunch_break_min_hours: 4,
  late_to_absent_count: 3,
  minimum_hours_for_half_day: 2,
  minimum_hours_for_full_day: 4,
  late_penalty_days: 0.5,
  late_fine_amount: 0,
  half_day_deduction: 0.5,
  overtime_enabled: false,
  overtime_min_minutes: 30,
  overtime_rate_multiplier: 1.5,
  overtime_max_hours_month: 0,
  leave_sick_quota: 0,
  leave_sick_paid: true,
  leave_casual_quota: 0,
  leave_casual_paid: true,
  leave_earned_quota: 0,
  leave_earned_paid: true,
};

/** Non-negative number where 0 is a meaningful value; falls back only on junk input. */
function nonNegative(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Numeric rules where 0 means "off", "none" or "unlimited"
const ZERO_OK_NUMBERS = [
  "late_to_absent_count",
  "late_penalty_days",
  "late_fine_amount",
  "half_day_deduction",
  "overtime_min_minutes",
  "overtime_rate_multiplier",
  "overtime_max_hours_month",
  "leave_sick_quota",
  "leave_casual_quota",
  "leave_earned_quota",
] as const;
const BOOLEANS = ["overtime_enabled", "leave_sick_paid", "leave_casual_paid", "leave_earned_paid"] as const;

function parseRules(rules: { id: string; value: string; valueType: string }[]): RuleValues {
  const result: RuleValues = { ...DEFAULT_RULES };
  for (const r of rules) {
    if (r.id === "grace_period") result.grace_period = parseInt(r.value, 10) || 15;
    if (r.id === "lunch_break_enabled") result.lunch_break_enabled = r.value === "true";
    if (r.id === "lunch_break_min_hours") result.lunch_break_min_hours = parseFloat(r.value) || 4;
    if (r.id === "minimum_hours_for_half_day") result.minimum_hours_for_half_day = parseFloat(r.value) || 2;
    if (r.id === "minimum_hours_for_full_day") result.minimum_hours_for_full_day = parseFloat(r.value) || 4;
    // Backward compat: old rule ID before migration 0014
    if (r.id === "minimum_hours_for_present") result.minimum_hours_for_full_day = parseFloat(r.value) || 4;
    for (const key of ZERO_OK_NUMBERS) {
      if (r.id === key) result[key] = nonNegative(r.value, DEFAULT_RULES[key]);
    }
    for (const key of BOOLEANS) {
      if (r.id === key) result[key] = r.value === "true";
    }
  }
  return result;
}

/** Rule values must be "true"/"false" for boolean rules and a non-negative number otherwise. */
export function validateRuleValue(valueType: string, value: string): string | null {
  if (valueType === "boolean") return value === "true" || value === "false" ? null : "Value must be true or false.";
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n) || n < 0) return "Value must be a number of 0 or more.";
  return null;
}

/** Get all global defaults as a typed object */
export function getGlobalDefaults(): RuleValues {
  const db = getDb();
  const rules = db.select().from(attendanceRules).all();
  return parseRules(rules.map((r) => ({ id: r.id, value: r.defaultValue, valueType: r.valueType })));
}

/** Get effective rules for a specific employee (override > default) */
export function getEffectiveRules(employeeId: string): RuleValues {
  const db = getDb();
  const rules = db.select().from(attendanceRules).all();
  const overrides = db
    .select()
    .from(employeeRuleOverrides)
    .where(eq(employeeRuleOverrides.employeeId, employeeId))
    .all();

  const overrideMap = new Map(overrides.map((o) => [o.ruleId, o.value]));

  return parseRules(
    rules.map((r) => ({
      id: r.id,
      value: overrideMap.get(r.id) ?? r.defaultValue,
      valueType: r.valueType,
    })),
  );
}

/** Get effective rules for multiple employees at once (avoids N+1 queries) */
export function getEffectiveRulesBatch(employeeIds: string[]): Map<string, RuleValues> {
  const db = getDb();
  const rules = db.select().from(attendanceRules).all();
  const allOverrides = db.select().from(employeeRuleOverrides).all();

  const overridesByEmp = new Map<string, Map<string, string>>();
  for (const o of allOverrides) {
    if (!overridesByEmp.has(o.employeeId)) overridesByEmp.set(o.employeeId, new Map());
    overridesByEmp.get(o.employeeId)!.set(o.ruleId, o.value);
  }

  const result = new Map<string, RuleValues>();
  for (const empId of employeeIds) {
    const overrideMap = overridesByEmp.get(empId) || new Map();
    result.set(
      empId,
      parseRules(
        rules.map((r) => ({
          id: r.id,
          value: overrideMap.get(r.id) ?? r.defaultValue,
          valueType: r.valueType,
        })),
      ),
    );
  }
  return result;
}
