import { randomUUID } from "node:crypto";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendanceRules, employeeRuleOverrides, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { validateRuleValue } from "../../../../lib/rules";
import { logActivity } from "../../../../lib/activity-logger";

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId");
  if (!employeeId) {
    return Response.json({ error: "employeeId is required." }, { status: 400 });
  }

  const db = getDb();
  const rules = db.select().from(attendanceRules).orderBy(asc(attendanceRules.category), asc(attendanceRules.sortOrder)).all();
  const overrides = db
    .select()
    .from(employeeRuleOverrides)
    .where(eq(employeeRuleOverrides.employeeId, employeeId))
    .all();

  const overrideMap = new Map(overrides.map((o) => [o.ruleId, o.value]));

  const result = rules.map((r) => ({
    ruleId: r.id,
    label: r.label,
    description: r.description,
    valueType: r.valueType,
    category: r.category,
    globalDefault: r.defaultValue,
    override: overrideMap.get(r.id) ?? null,
    effectiveValue: overrideMap.get(r.id) ?? r.defaultValue,
  }));

  return Response.json({ employeeId, rules: result });
}

export async function PUT(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { employeeId?: string; ruleId?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.employeeId || !body.ruleId || body.value === undefined) {
    return Response.json({ error: "employeeId, ruleId, and value are required." }, { status: 400 });
  }

  const db = getDb();

  // Validate employee exists
  const emp = db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.id, body.employeeId)).get();
  if (!emp) return Response.json({ error: "Employee not found." }, { status: 404 });

  // Validate rule exists
  const rule = db.select().from(attendanceRules).where(eq(attendanceRules.id, body.ruleId)).get();
  if (!rule) return Response.json({ error: "Rule not found." }, { status: 404 });

  body.value = String(body.value).trim();
  const invalid = validateRuleValue(rule.valueType, body.value);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  // Upsert: check if override exists
  const existing = db
    .select({ id: employeeRuleOverrides.id })
    .from(employeeRuleOverrides)
    .where(and(eq(employeeRuleOverrides.employeeId, body.employeeId), eq(employeeRuleOverrides.ruleId, body.ruleId)))
    .get();

  if (existing) {
    db.update(employeeRuleOverrides)
      .set({ value: body.value, updatedAt: new Date().toISOString() })
      .where(eq(employeeRuleOverrides.id, existing.id))
      .run();
  } else {
    db.insert(employeeRuleOverrides)
      .values({
        id: randomUUID(),
        employeeId: body.employeeId,
        ruleId: body.ruleId,
        value: body.value,
      })
      .run();
  }

  logActivity({
    actionType: "rule_updated",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: emp.id,
    targetName: emp.name,
    description: `${auth.identity.displayName} set "${rule.label}" to ${body.value} for ${emp.name}`,
    metadata: { ruleId: rule.id, employeeId: emp.id, value: body.value },
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { employeeId?: string; ruleId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.employeeId || !body.ruleId) {
    return Response.json({ error: "employeeId and ruleId are required." }, { status: 400 });
  }

  const db = getDb();
  db.delete(employeeRuleOverrides)
    .where(and(eq(employeeRuleOverrides.employeeId, body.employeeId), eq(employeeRuleOverrides.ruleId, body.ruleId)))
    .run();

  return Response.json({ ok: true });
}
