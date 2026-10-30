import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";
import { getHolidayCalendar } from "../../../../lib/holidays";

/** Upcoming holidays for the logged-in employee, each marked paid or unpaid for them. */
export async function GET() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const db = getDb();
  const emp = db
    .select({ flexibleHours: employees.flexibleHours, paidHolidays: employees.paidHolidays })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();
  const isFlexible = emp?.flexibleHours ?? false;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const until = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cal = getHolidayCalendar(today, until);
  const empForHolidays = { id: identity.employeeId, paidHolidays: emp?.paidHolidays ?? true };

  // Every holiday is listed (the office is closed either way); paid says whether this employee is paid for it.
  // null for hourly staff, who are paid by hours worked.
  const upcoming = [...cal.byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
    .map((h) => ({ date: h.date, name: h.name, paid: isFlexible ? null : cal.isPaidFor(h, empForHolidays) }));

  return Response.json({ holidays: upcoming, isFlexible });
}
