import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees, employeeBranches } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";
import { getEffectiveRules } from "../../../../lib/rules";
import { pendingMissPunchesForDay } from "../../../../lib/punch-state";

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
      punchAnywhere: employees.punchAnywhere,
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

  // Miss-punch requests still waiting for approval count as punches, so an
  // employee who forgot to punch in can punch out normally
  const pending = pendingMissPunchesForDay(identity.employeeId, today);

  // Prefer selfie-based records over admin-marked ones (admin records have
  // non-file photoKeys like "admin-marked" or "admin/unpaid-holiday")
  const recordedIn = records.find((r) => r.punchType === "IN" && r.source !== "admin")
    || records.find((r) => r.punchType === "IN");
  const recordedOut = records.find((r) => r.punchType === "OUT" && r.source !== "admin")
    || records.find((r) => r.punchType === "OUT");
  const pendingIn = pending.find((p) => p.punchType === "IN");
  const pendingOut = [...pending].reverse().find((p) => p.punchType === "OUT");

  // Build ordered punches array for multi-cycle support (pending ones flagged)
  const orderedPunches = [
    ...records.map((r) => ({
      type: r.punchType as "IN" | "OUT",
      time: r.serverTimestamp,
      office: r.office,
      photoKey: r.photoKey,
    })),
    ...pending.map((p) => ({ type: p.punchType, time: p.serverTimestamp, office: "", pending: true as const })),
  ].sort((a, b) => a.time.localeCompare(b.time));

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
      // Last punch is OUT
      if (emp?.flexibleHours) {
        // Flex/lecture employees can always start another session
        nextPunchType = "IN";
        canPunchIn = true;
      } else if (empRules.lunch_break_enabled) {
        // Regular employees: check time gap since first IN
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

  // Fetch employee's assigned branch IDs for client-side geo-fence
  const branchAssignments = db
    .select({ branchId: employeeBranches.branchId })
    .from(employeeBranches)
    .where(eq(employeeBranches.employeeId, identity.employeeId))
    .all();
  const assignedBranchIds = branchAssignments.map((a) => a.branchId);

  return Response.json({
    employeeId: identity.employeeId,
    workStartTime: emp?.workStartTime || "09:00",
    workEndTime: emp?.workEndTime || "18:00",
    office: emp?.office || "",
    assignedBranchIds,
    punchAnywhere: emp?.punchAnywhere ?? false,
    punchIn: recordedIn
      ? { time: recordedIn.serverTimestamp, office: recordedIn.office, photoKey: recordedIn.photoKey }
      : pendingIn ? { time: pendingIn.serverTimestamp, office: "", pending: true } : null,
    punchOut: recordedOut
      ? { time: recordedOut.serverTimestamp, office: recordedOut.office, photoKey: recordedOut.photoKey }
      : pendingOut ? { time: pendingOut.serverTimestamp, office: "", pending: true } : null,
    pendingPunches: pending.map((p) => ({ type: p.punchType, time: p.serverTimestamp })),
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
  }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
