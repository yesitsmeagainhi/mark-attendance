import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendanceRules } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { logActivity } from "../../../../lib/activity-logger";
import { validateRuleValue } from "../../../../lib/rules";

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const db = getDb();
  const rules = db
    .select()
    .from(attendanceRules)
    .orderBy(asc(attendanceRules.category), asc(attendanceRules.sortOrder))
    .all();

  return Response.json({ rules });
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { ruleId?: string; defaultValue?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.ruleId || body.defaultValue === undefined) {
    return Response.json({ error: "ruleId and defaultValue are required." }, { status: 400 });
  }

  const db = getDb();
  const rule = db.select().from(attendanceRules).where(eq(attendanceRules.id, body.ruleId)).get();
  if (!rule) {
    return Response.json({ error: "Rule not found." }, { status: 404 });
  }

  const value = String(body.defaultValue).trim();
  const invalid = validateRuleValue(rule.valueType, value);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  db.update(attendanceRules)
    .set({ defaultValue: value, updatedAt: new Date().toISOString() })
    .where(eq(attendanceRules.id, body.ruleId))
    .run();

  if (value !== rule.defaultValue) {
    logActivity({
      actionType: "rule_updated",
      performedBy: auth.identity.employeeId,
      performedByName: auth.identity.displayName,
      targetId: rule.id,
      targetName: rule.label,
      description: `${auth.identity.displayName} changed "${rule.label}" from ${rule.defaultValue} to ${value} for all employees`,
      metadata: { ruleId: rule.id, from: rule.defaultValue, to: value },
    });
  }

  return Response.json({ ok: true });
}
