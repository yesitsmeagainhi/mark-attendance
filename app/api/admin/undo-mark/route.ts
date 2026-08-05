import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { employeeId?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { employeeId, date } = body;
  if (!employeeId || !date) {
    return Response.json({ error: "employeeId and date are required." }, { status: 400 });
  }

  const db = getDb();

  // Delete only admin-created records for this employee on this date
  db.delete(attendance)
    .where(and(
      eq(attendance.employeeId, employeeId),
      eq(attendance.source, "admin"),
      sql`date(${attendance.serverTimestamp}) = ${date}`,
    ))
    .run();

  return Response.json({ ok: true });
}
