import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { employees } from "../../../db/schema";
import { getAppIdentity } from "../../authz";

/**
 * Whose birthday it is today.
 *
 * Deliberately NOT admin-gated: the whole point is that every employee sees the
 * wish, so this uses getAppIdentity rather than requireApiRole. It returns only
 * name / id / job role — never the stored year, mobile or email — so a birthday
 * list cannot become a staff directory for non-admins.
 *
 * Matching is on month+day, taken in Asia/Kolkata so the wish lands on the
 * right calendar day for the office rather than for the server's timezone.
 */
export async function GET(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  // `date` is accepted for testing; the default is today in the office's zone.
  const explicit = url.searchParams.get("date");
  const today =
    explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)
      ? explicit
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

  const monthDay = today.slice(5); // "MM-DD"

  const db = getDb();
  const rows = db
    .select({
      id: employees.id,
      name: employees.name,
      jobRole: employees.jobRole,
      office: employees.office,
    })
    .from(employees)
    .where(
      and(
        eq(employees.active, true),
        sql`substr(${employees.dateOfBirth}, 6) = ${monthDay}`,
        sql`length(${employees.dateOfBirth}) = 10`,
      ),
    )
    .orderBy(employees.name)
    .all();

  return Response.json({ date: today, birthdays: rows });
}
