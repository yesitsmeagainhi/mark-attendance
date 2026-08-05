import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { dailyJournals, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const employeeId = url.searchParams.get("employee");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const db = getDb();

  let conditions = [];
  if (date) conditions.push(eq(dailyJournals.date, date));
  if (employeeId) conditions.push(eq(dailyJournals.employeeId, employeeId));
  if (from) conditions.push(gte(dailyJournals.date, from));
  if (to) conditions.push(lte(dailyJournals.date, to));

  const journals = db
    .select({
      id: dailyJournals.id,
      employeeId: dailyJournals.employeeId,
      employeeName: employees.name,
      date: dailyJournals.date,
      tasks: dailyJournals.tasks,
      todos: dailyJournals.todos,
      updatedAt: dailyJournals.updatedAt,
    })
    .from(dailyJournals)
    .innerJoin(employees, eq(dailyJournals.employeeId, employees.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(dailyJournals.date))
    .limit(100)
    .all();

  return Response.json({
    journals: journals.map((j) => ({
      ...j,
      todos: j.todos ? JSON.parse(j.todos) : [],
    })),
  });
}
