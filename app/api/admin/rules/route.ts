import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendanceRules } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const db = getDb();
  const rules = db.select().from(attendanceRules).all();

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
  const rule = db.select({ id: attendanceRules.id }).from(attendanceRules).where(eq(attendanceRules.id, body.ruleId)).get();
  if (!rule) {
    return Response.json({ error: "Rule not found." }, { status: 404 });
  }

  db.update(attendanceRules)
    .set({ defaultValue: body.defaultValue, updatedAt: new Date().toISOString() })
    .where(eq(attendanceRules.id, body.ruleId))
    .run();

  return Response.json({ ok: true });
}
