import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attendance, employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { getEffectiveRulesBatch } from "../../../../lib/rules";
import { getHolidayCalendar } from "../../../../lib/holidays";

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const db = getDb();

  // Get all active employees
  const allEmployees = db
    .select({
      id: employees.id,
      name: employees.name,
      workStartTime: employees.workStartTime,
      workEndTime: employees.workEndTime,
      flexibleHours: employees.flexibleHours,
      paidHolidays: employees.paidHolidays,
    })
    .from(employees)
    .where(and(eq(employees.active, true), sql`${employees.role} != 'admin'`))
    .orderBy(employees.name)
    .all();

  // Get attendance records for the date
  const records = db
    .select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      office: attendance.office,
      photoKey: attendance.photoKey,
      source: attendance.source,
      latitude: attendance.latitude,
      longitude: attendance.longitude,
    })
    .from(attendance)
    .where(sql`date(${attendance.serverTimestamp}) = ${date}`)
    .orderBy(desc(attendance.serverTimestamp))
    .all();

  // Check if date is a holiday
  const holidayCal = getHolidayCalendar(date, date);
  const holiday = holidayCal.byDate.get(date);

  // Load rules for all employees at once
  const rulesByEmp = getEffectiveRulesBatch(allEmployees.map((e) => e.id));

  // Build per-employee status
  const result = allEmployees.map((emp) => {
    const empRecords = records.filter((r) => r.employeeId === emp.id);
    // Prefer selfie-based records over admin-marked ones so real punches
    // are shown even when admin also marked the employee
    const punchIn = empRecords.find((r) => r.punchType === "IN" && r.source !== "admin")
      || empRecords.find((r) => r.punchType === "IN");
    const punchOut = empRecords.find((r) => r.punchType === "OUT" && r.source !== "admin")
      || empRecords.find((r) => r.punchType === "OUT");

    let status: string = "not_marked";
    let source: string | null = null;

    if (punchIn) {
      source = punchIn.source;

      // Check if this is an admin-marked UH record
      if (punchIn.photoKey === "admin/unpaid-holiday") {
        status = "unpaid_holiday";
      } else {
        // If punch-out is missing on a past day, treat as absent
        const todayStr = new Date().toISOString().slice(0, 10);
        if (!punchOut && date < todayStr) {
          status = "absent";
        } else {
          // Determine on-time vs late based on punch time
          const ts = punchIn.serverTimestamp;
          const punchDate = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
          const punchHour = punchDate.getUTCHours() + 5;
          const punchMin = punchDate.getUTCMinutes() + 30;
          const totalPunchMin = (punchHour * 60 + punchMin) % (24 * 60);

          // Flexible-hours employees always marked present
          if (emp.flexibleHours) {
            status = "present";
          } else {
            const [startH, startM] = emp.workStartTime.split(":").map(Number);
            const shiftStartMin = startH * 60 + startM;
            const empRules = rulesByEmp.get(emp.id)!;
            const graceMin = shiftStartMin + empRules.grace_period;

            if (totalPunchMin <= graceMin) {
              status = "present";
            } else {
              status = "late";
            }
          }
        }
      }
    } else if (holiday) {
      // Only apply holiday status if employee has no punch record
      status = emp.flexibleHours || holidayCal.isPaidFor(holiday, emp) ? "paid_holiday" : "unpaid_holiday";
    } else {
      // No punch record — check if it's a past date
      const today = new Date().toISOString().slice(0, 10);
      status = date < today ? "absent" : "not_marked";
    }

    // Calculate work duration in minutes (sum all IN/OUT pairs for multi-session)
    let durationMinutes: number | null = null;
    const sorted = punchIn
      ? [...empRecords].sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp))
      : [];
    if (punchIn) {
      let total = 0;
      for (let i = 0; i < sorted.length; i += 2) {
        if (sorted[i]?.punchType === "IN" && sorted[i + 1]?.punchType === "OUT") {
          const inD = new Date(sorted[i].serverTimestamp.replace(" ", "T") + (sorted[i].serverTimestamp.includes("Z") ? "" : "Z"));
          const outD = new Date(sorted[i + 1].serverTimestamp.replace(" ", "T") + (sorted[i + 1].serverTimestamp.includes("Z") ? "" : "Z"));
          total += Math.max(0, Math.floor((outD.getTime() - inD.getTime()) / 60000));
        }
      }
      if (total > 0) durationMinutes = total;
    }

    // Build per-session breakdown for flex employees
    type SessionRecord = { inTime: string; outTime: string | null; inPhotoKey: string; outPhotoKey: string | null; durationMinutes: number | null; office: string };
    const sessions: SessionRecord[] = [];
    if (emp.flexibleHours && punchIn) {
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].punchType === "IN") {
          const out = sorted[i + 1]?.punchType === "OUT" ? sorted[i + 1] : null;
          let dur: number | null = null;
          if (out) {
            const inD = new Date(sorted[i].serverTimestamp.replace(" ", "T") + (sorted[i].serverTimestamp.includes("Z") ? "" : "Z"));
            const outD = new Date(out.serverTimestamp.replace(" ", "T") + (out.serverTimestamp.includes("Z") ? "" : "Z"));
            dur = Math.max(0, Math.floor((outD.getTime() - inD.getTime()) / 60000));
          }
          sessions.push({
            inTime: sorted[i].serverTimestamp,
            outTime: out?.serverTimestamp ?? null,
            inPhotoKey: sorted[i].photoKey,
            outPhotoKey: out?.photoKey ?? null,
            durationMinutes: dur,
            office: sorted[i].office,
          });
          if (out) i++; // skip paired OUT
        }
      }
    }

    return {
      id: emp.id,
      name: emp.name,
      workStartTime: emp.workStartTime,
      flexibleHours: emp.flexibleHours,
      punchIn: punchIn
        ? { time: punchIn.serverTimestamp, photoKey: punchIn.photoKey, source: punchIn.source, office: punchIn.office, latitude: punchIn.latitude, longitude: punchIn.longitude }
        : null,
      punchOut: punchOut
        ? { time: punchOut.serverTimestamp, photoKey: punchOut.photoKey, source: punchOut.source, office: punchOut.office, latitude: punchOut.latitude, longitude: punchOut.longitude }
        : null,
      durationMinutes,
      sessions,
      status,
      source,
    };
  });

  const checkedIn = result.filter((e) => e.status === "present" || e.status === "late").length;
  const absent = result.filter((e) => e.status === "absent").length;

  return Response.json({
    date,
    isHoliday: !!holiday,
    holidayType: holiday ? (holiday.paid ? "paid_holiday" : "unpaid_holiday") : null,
    holidayName: holiday?.name || null,
    employees: result,
    summary: { total: allEmployees.length, checkedIn, absent },
  });
}
