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
};

function parseRules(rules: { id: string; value: string; valueType: string }[]): RuleValues {
  const result: RuleValues = { grace_period: 15, lunch_break_enabled: false, lunch_break_min_hours: 4, late_to_absent_count: 3, minimum_hours_for_half_day: 2, minimum_hours_for_full_day: 4 };
  for (const r of rules) {
    if (r.id === "grace_period") result.grace_period = parseInt(r.value, 10) || 15;
    if (r.id === "lunch_break_enabled") result.lunch_break_enabled = r.value === "true";
    if (r.id === "lunch_break_min_hours") result.lunch_break_min_hours = parseFloat(r.value) || 4;
    if (r.id === "late_to_absent_count") result.late_to_absent_count = parseInt(r.value, 10) || 3;
    if (r.id === "minimum_hours_for_half_day") result.minimum_hours_for_half_day = parseFloat(r.value) || 2;
    if (r.id === "minimum_hours_for_full_day") result.minimum_hours_for_full_day = parseFloat(r.value) || 4;
    // Backward compat: old rule ID before migration 0014
    if (r.id === "minimum_hours_for_present") result.minimum_hours_for_full_day = parseFloat(r.value) || 4;
  }
  return result;
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
