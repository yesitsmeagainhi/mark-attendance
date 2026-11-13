import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees, shifts } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { logActivity } from "../../../../lib/activity-logger";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Shift templates plus the staff list needed to assign them. */
export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const db = getDb();
  const shiftRows = db.select().from(shifts).orderBy(asc(shifts.startTime), asc(shifts.name)).all();
  const staff = db
    .select({
      id: employees.id,
      name: employees.name,
      department: employees.department,
      workStartTime: employees.workStartTime,
      workEndTime: employees.workEndTime,
      shiftId: employees.shiftId,
      flexibleHours: employees.flexibleHours,
    })
    .from(employees)
    .where(and(eq(employees.active, true), sql`${employees.role} != 'admin'`))
    .orderBy(employees.name)
    .all();

  return Response.json({
    shifts: shiftRows.map((s) => ({ ...s, employeeCount: staff.filter((e) => e.shiftId === s.id).length })),
    employees: staff,
  });
}

/** Create a shift template. */
export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const body = await readJson<{ name?: string; startTime?: string; endTime?: string }>(request);
  if (!body) return badRequest("Invalid request.");
  const name = body.name?.trim();
  if (!name) return badRequest("Shift name is required.");
  if (!body.startTime || !TIME_RE.test(body.startTime)) return badRequest("Start time must be HH:MM.");
  if (!body.endTime || !TIME_RE.test(body.endTime)) return badRequest("End time must be HH:MM.");
  if (body.endTime <= body.startTime) return badRequest("End time must be after start time.");

  const db = getDb();
  const dup = db.select({ id: shifts.id }).from(shifts).where(sql`lower(${shifts.name}) = ${name.toLowerCase()}`).get();
  if (dup) return Response.json({ error: "A shift with this name already exists." }, { status: 409 });

  const id = randomUUID();
  db.insert(shifts).values({ id, name, startTime: body.startTime, endTime: body.endTime }).run();

  logActivity({
    actionType: "shift_created",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: id,
    targetName: name,
    description: `${auth.identity.displayName} created shift "${name}" (${body.startTime}–${body.endTime})`,
  });

  return Response.json({ id }, { status: 201 });
}

/** Edit a shift. New timings are applied to every employee on the shift. */
export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const body = await readJson<{ id?: string; name?: string; startTime?: string; endTime?: string }>(request);
  if (!body?.id) return badRequest("Shift id is required.");

  const db = getDb();
  const shift = db.select().from(shifts).where(eq(shifts.id, body.id)).get();
  if (!shift) return Response.json({ error: "Shift not found." }, { status: 404 });

  const name = body.name !== undefined ? body.name.trim() : shift.name;
  const startTime = body.startTime ?? shift.startTime;
  const endTime = body.endTime ?? shift.endTime;
  if (!name) return badRequest("Shift name is required.");
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return badRequest("Times must be HH:MM.");
  if (endTime <= startTime) return badRequest("End time must be after start time.");
  if (name.toLowerCase() !== shift.name.toLowerCase()) {
    const dup = db.select({ id: shifts.id }).from(shifts).where(sql`lower(${shifts.name}) = ${name.toLowerCase()}`).get();
    if (dup) return Response.json({ error: "A shift with this name already exists." }, { status: 409 });
  }

  db.update(shifts).set({ name, startTime, endTime }).where(eq(shifts.id, shift.id)).run();
  const updated = db
    .update(employees)
    .set({ workStartTime: startTime, workEndTime: endTime })
    .where(eq(employees.shiftId, shift.id))
    .run();

  logActivity({
    actionType: "shift_updated",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: shift.id,
    targetName: name,
    description: `${auth.identity.displayName} updated shift "${name}" to ${startTime}–${endTime} (${updated.changes} employees)`,
    metadata: { from: { name: shift.name, startTime: shift.startTime, endTime: shift.endTime }, to: { name, startTime, endTime } },
  });

  return Response.json({ ok: true, employeesUpdated: updated.changes });
}

/**
 * Set exactly which employees are on a shift. Newly added employees get the
 * shift's timings; removed employees keep their timings as custom hours.
 */
export async function PUT(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const body = await readJson<{ shiftId?: string; employeeIds?: string[] }>(request);
  if (!body?.shiftId || !Array.isArray(body.employeeIds)) return badRequest("shiftId and employeeIds are required.");
  const employeeIds = body.employeeIds.filter((id): id is string => typeof id === "string");

  const db = getDb();
  const shift = db.select().from(shifts).where(eq(shifts.id, body.shiftId)).get();
  if (!shift) return Response.json({ error: "Shift not found." }, { status: 404 });

  db.transaction((tx) => {
    tx.update(employees)
      .set({ shiftId: null })
      .where(employeeIds.length > 0
        ? and(eq(employees.shiftId, shift.id), notInArray(employees.id, employeeIds))
        : eq(employees.shiftId, shift.id))
      .run();
    if (employeeIds.length > 0) {
      tx.update(employees)
        .set({ shiftId: shift.id, workStartTime: shift.startTime, workEndTime: shift.endTime })
        .where(inArray(employees.id, employeeIds))
        .run();
    }
  });

  logActivity({
    actionType: "shift_assigned",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: shift.id,
    targetName: shift.name,
    description: `${auth.identity.displayName} assigned ${employeeIds.length} employees to shift "${shift.name}"`,
    metadata: { employeeIds },
  });

  return Response.json({ ok: true });
}

/** Delete a shift. Its employees keep their current timings. */
export async function DELETE(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const body = await readJson<{ id?: string }>(request);
  if (!body?.id) return badRequest("Shift id is required.");

  const db = getDb();
  const shift = db.select().from(shifts).where(eq(shifts.id, body.id)).get();
  if (!shift) return Response.json({ error: "Shift not found." }, { status: 404 });

  db.transaction((tx) => {
    tx.update(employees).set({ shiftId: null }).where(eq(employees.shiftId, shift.id)).run();
    tx.delete(shifts).where(eq(shifts.id, shift.id)).run();
  });

  logActivity({
    actionType: "shift_deleted",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    targetId: shift.id,
    targetName: shift.name,
    description: `${auth.identity.displayName} deleted shift "${shift.name}"`,
  });

  return Response.json({ ok: true });
}
