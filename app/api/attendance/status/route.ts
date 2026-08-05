import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";

export async function GET() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Get employee's work schedule
  const emp = db
    .select({
      workStartTime: employees.workStartTime,
      workEndTime: employees.workEndTime,
      office: employees.office,
    })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  // Get today's punch records for this employee
  const records = db
    .select({
      id: attendance.id,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      office: attendance.office,
      photoKey: attendance.photoKey,
      source: attendance.source,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, identity.employeeId),
        sql`date(${attendance.serverTimestamp}) = ${today}`,
      ),
    )
    .orderBy(desc(attendance.serverTimestamp))
    .all();

  // Prefer selfie-based records over admin-marked ones (admin records have
  // non-file photoKeys like "admin-marked" or "admin/unpaid-holiday")
  const punchIn = records.find((r) => r.punchType === "IN" && r.source !== "admin")
    || records.find((r) => r.punchType === "IN");
  const punchOut = records.find((r) => r.punchType === "OUT" && r.source !== "admin")
    || records.find((r) => r.punchType === "OUT");

  return Response.json({
    employeeId: identity.employeeId,
    workStartTime: emp?.workStartTime || "09:00",
    workEndTime: emp?.workEndTime || "18:00",
    office: emp?.office || "",
    punchIn: punchIn
      ? { time: punchIn.serverTimestamp, office: punchIn.office, photoKey: punchIn.photoKey }
      : null,
    punchOut: punchOut
      ? { time: punchOut.serverTimestamp, office: punchOut.office, photoKey: punchOut.photoKey }
      : null,
  });
}
