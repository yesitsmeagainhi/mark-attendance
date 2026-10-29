import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { holidayEmployeeOverrides, holidays } from "../../../db/schema";
import { requireApiRole } from "../../authz";
import { logActivity } from "../../../lib/activity-logger";
import { getPayrollEmployees, saveHolidayOverrides } from "../../../lib/holidays";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const year = url.searchParams.get("year") || String(new Date().getFullYear());

  const db = getDb();
  const rows = db
    .select()
    .from(holidays)
    .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)))
    .orderBy(asc(holidays.date))
    .all();

  const emps = getPayrollEmployees();
  const allOverrides = db.select().from(holidayEmployeeOverrides).all();
  const overrideMap = new Map(allOverrides.map((o) => [`${o.holidayId}:${o.employeeId}`, o.paid]));

  const list = rows.map((h) => {
    const paidEmployeeIds = emps
      .filter((e) => overrideMap.get(`${h.id}:${e.id}`) ?? (h.paid && e.paidHolidays))
      .map((e) => e.id);
    return { id: h.id, date: h.date, name: h.name, paid: h.paid, note: h.note, paidEmployeeIds };
  });

  return Response.json({ year, holidays: list, employees: emps });
}

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { date?: string; name?: string; paid?: boolean; paidEmployeeIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const date = body.date?.trim() || "";
  const name = body.name?.trim() || "";
  const paid = body.paid !== false;
  if (!DATE_RE.test(date)) return Response.json({ error: "A valid date is required." }, { status: 400 });
  if (name.length < 2) return Response.json({ error: "Holiday name is required (minimum 2 characters)." }, { status: 400 });

  const db = getDb();
  const existing = db.select({ id: holidays.id, name: holidays.name }).from(holidays).where(eq(holidays.date, date)).get();
  if (existing) {
    return Response.json({ error: `${date} is already a holiday (${existing.name}). Edit it instead.` }, { status: 409 });
  }

  const id = crypto.randomUUID();
  db.insert(holidays).values({ id, date, name, paid, type: paid ? "paid_holiday" : "unpaid_holiday" }).run();
  if (body.paidEmployeeIds) saveHolidayOverrides(id, paid, body.paidEmployeeIds);

  logActivity({
    actionType: "holiday_added",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: id,
    targetName: name,
    description: `Admin added ${paid ? "paid" : "unpaid"} holiday "${name}" on ${date}`,
    metadata: { date, name, paid },
  });

  return Response.json({ id, date, name }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { id?: string; date?: string; name?: string; paid?: boolean; paidEmployeeIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "Holiday ID is required." }, { status: 400 });

  const db = getDb();
  const holiday = db.select().from(holidays).where(eq(holidays.id, body.id)).get();
  if (!holiday) return Response.json({ error: "Holiday not found." }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.date !== undefined) {
    const date = body.date.trim();
    if (!DATE_RE.test(date)) return Response.json({ error: "A valid date is required." }, { status: 400 });
    const dup = db.select({ id: holidays.id }).from(holidays)
      .where(and(eq(holidays.date, date), sql`${holidays.id} != ${body.id}`)).get();
    if (dup) return Response.json({ error: `${date} is already a holiday.` }, { status: 409 });
    updates.date = date;
  }
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2) return Response.json({ error: "Holiday name is required (minimum 2 characters)." }, { status: 400 });
    updates.name = name;
  }
  const paid = body.paid ?? holiday.paid;
  if (body.paid !== undefined) {
    updates.paid = paid;
    updates.type = paid ? "paid_holiday" : "unpaid_holiday";
  }

  if (Object.keys(updates).length > 0) {
    db.update(holidays).set(updates).where(eq(holidays.id, body.id)).run();
  }
  if (body.paidEmployeeIds) saveHolidayOverrides(body.id, paid, body.paidEmployeeIds);

  const finalName = (updates.name as string) ?? holiday.name;
  const finalDate = (updates.date as string) ?? holiday.date;
  logActivity({
    actionType: "holiday_updated",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: body.id,
    targetName: finalName,
    description: `Admin updated holiday "${finalName}" on ${finalDate} (${paid ? "paid" : "unpaid"}${body.paidEmployeeIds ? `, paid for ${body.paidEmployeeIds.length} employee(s)` : ""})`,
    metadata: { date: finalDate, name: finalName, paid },
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "Holiday ID is required." }, { status: 400 });

  const db = getDb();
  const holiday = db.select().from(holidays).where(eq(holidays.id, body.id)).get();
  if (!holiday) return Response.json({ error: "Holiday not found." }, { status: 404 });

  db.delete(holidayEmployeeOverrides).where(eq(holidayEmployeeOverrides.holidayId, body.id)).run();
  db.delete(holidays).where(eq(holidays.id, body.id)).run();

  logActivity({
    actionType: "holiday_removed",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: body.id,
    targetName: holiday.name,
    description: `Admin removed holiday "${holiday.name}" on ${holiday.date}`,
    metadata: { date: holiday.date, name: holiday.name },
  });

  return Response.json({ ok: true });
}
