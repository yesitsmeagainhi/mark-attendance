import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";
import { getEffectiveRules } from "../../../../lib/rules";

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
      flexibleHours: employees.flexibleHours,
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

  // Build ordered punches array for multi-cycle support
  const orderedPunches = [...records]
    .sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp))
    .map((r) => ({
      type: r.punchType as "IN" | "OUT",
      time: r.serverTimestamp,
      office: r.office,
      photoKey: r.photoKey,
    }));

  const lastPunch = orderedPunches.length > 0 ? orderedPunches[orderedPunches.length - 1] : null;
  const empRules = getEffectiveRules(identity.employeeId);

  // Determine next punch type and permissions
  let nextPunchType: "IN" | "OUT" | null = "IN";
  let canPunchIn = true;
  let canPunchOut = false;

  if (lastPunch) {
    if (lastPunch.type === "IN") {
      nextPunchType = "OUT";
      canPunchIn = false;
      canPunchOut = true;
    } else {
      // Last punch is OUT — check if re-entry is allowed
      if (empRules.lunch_break_enabled) {
        const firstIn = orderedPunches.find((p) => p.type === "IN");
        if (firstIn) {
          const firstInDate = new Date(firstIn.time.replace(" ", "T") + (firstIn.time.includes("Z") ? "" : "Z"));
          const hoursSinceFirstIn = (Date.now() - firstInDate.getTime()) / (1000 * 60 * 60);
          canPunchIn = hoursSinceFirstIn >= empRules.lunch_break_min_hours;
        }
        nextPunchType = canPunchIn ? "IN" : null;
      } else {
        nextPunchType = null;
        canPunchIn = false;
      }
      canPunchOut = false;
    }
  }

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
    punches: orderedPunches,
    flexibleHours: emp?.flexibleHours ?? false,
    rules: {
      gracePeriod: empRules.grace_period,
      lunchBreakEnabled: empRules.lunch_break_enabled,
      lunchBreakMinHours: empRules.lunch_break_min_hours,
    },
    nextPunchType,
    canPunchIn,
    canPunchOut,
  });
}
