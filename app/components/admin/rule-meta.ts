/** Display metadata for attendance / payroll rules (ids match attendance_rules.id). */

export const RULE_CATEGORIES: { id: string; title: string; hint: string }[] = [
  { id: "attendance", title: "Shift & attendance", hint: "When a punch counts as late, and how many hours make a half or full day." },
  { id: "penalty", title: "Penalties", hint: "Salary deductions for late marks and half days." },
  { id: "overtime", title: "Overtime pay", hint: "Extra pay for time worked beyond the shift on full working days." },
  { id: "leave", title: "Leave policy", hint: "Yearly paid quota per leave type. Approved leave beyond the quota is deducted." },
];

const UNITS: Record<string, { unit: string; step: number }> = {
  grace_period: { unit: "min", step: 1 },
  lunch_break_min_hours: { unit: "hrs", step: 0.5 },
  minimum_hours_for_half_day: { unit: "hrs", step: 0.5 },
  minimum_hours_for_full_day: { unit: "hrs", step: 0.5 },
  late_to_absent_count: { unit: "lates", step: 1 },
  late_penalty_days: { unit: "days", step: 0.5 },
  late_fine_amount: { unit: "₹", step: 10 },
  half_day_deduction: { unit: "days", step: 0.25 },
  overtime_min_minutes: { unit: "min", step: 5 },
  overtime_rate_multiplier: { unit: "×", step: 0.25 },
  overtime_max_hours_month: { unit: "hrs", step: 1 },
  leave_sick_quota: { unit: "days", step: 1 },
  leave_casual_quota: { unit: "days", step: 1 },
  leave_earned_quota: { unit: "days", step: 1 },
};

export function ruleUnit(ruleId: string): { unit: string; step: number } {
  return UNITS[ruleId] ?? { unit: "", step: 0.5 };
}

export function categoryTitle(id: string): string {
  return RULE_CATEGORIES.find((c) => c.id === id)?.title ?? "Other";
}

/** Group items by rule category, in display order. */
export function groupByCategory<T extends { category?: string }>(items: T[]): { id: string; title: string; hint: string; items: T[] }[] {
  const known = RULE_CATEGORIES.map((c) => ({ ...c, items: items.filter((i) => (i.category ?? "attendance") === c.id) }));
  const other = items.filter((i) => !RULE_CATEGORIES.some((c) => c.id === (i.category ?? "attendance")));
  return [...known, ...(other.length ? [{ id: "other", title: "Other", hint: "", items: other }] : [])].filter((g) => g.items.length > 0);
}
