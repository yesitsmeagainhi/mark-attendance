import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, holidays } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { istToUTC } from "../../../../lib/time-utils";
import { logActivity } from "../../../../lib/activity-logger";

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { date?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { date, action } = body;
  if (!date || !action) {
    return Response.json({ error: "date and action are required." }, { status: 400 });
  }
  if (!["present", "unpaid_holiday"].includes(action)) {
    return Response.json({ error: "Invalid action." }, { status: 400 });
  }

  const db = getDb();

  if (action === "unpaid_holiday") {
    // Insert or replace holiday record
    const existing = db.select({ id: holidays.id }).from(holidays).where(eq(holidays.date, date)).get();
    if (existing) {
      db.update(holidays).set({ type: "unpaid_holiday" }).where(eq(holidays.id, existing.id)).run();
    } else {
      db.insert(holidays).values({
        id: crypto.randomUUID(),
        date,
        type: "unpaid_holiday",
      }).run();
    }
    logActivity({
      actionType: "mark_all_uh",
      performedBy: auth.identity.employeeId,
      performedByName: auth.identity.displayName,
      description: `Admin marked ${date} as Unpaid Holiday for all employees`,
      metadata: { date, action: "unpaid_holiday" },
    });
    return Response.json({ ok: true, action: "unpaid_holiday" });
  }

  // Mark all present: for each active employee without an attendance record, create one
  const allEmployees = db
    .select({ id: employees.id, workStartTime: employees.workStartTime, office: employees.office })
    .from(employees)
    .where(eq(employees.active, true))
    .all();

  let affected = 0;
  for (const emp of allEmployees) {
    const existing = db
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(
        eq(attendance.employeeId, emp.id),
        eq(attendance.punchType, "IN"),
        sql`date(${attendance.serverTimestamp}) = ${date}`,
      ))
      .get();

    if (!existing) {
      db.insert(attendance).values({
        id: crypto.randomUUID(),
        employeeId: emp.id,
        punchType: "IN",
        serverTimestamp: istToUTC(date, emp.workStartTime),
        photoKey: "admin-marked",
        contentType: "text/plain",
        office: emp.office,
        source: "admin",
      }).run();
      affected++;
    }
  }

  logActivity({
    actionType: "mark_all_present",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    description: `Admin marked all employees as Present for ${date} (${affected} affected)`,
    metadata: { date, action: "present", affected },
  });

  return Response.json({ ok: true, affected });
}
