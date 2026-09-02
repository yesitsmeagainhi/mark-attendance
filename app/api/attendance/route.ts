import { eq, and, sql, desc, asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { attendance, employees, branches, employeeBranches } from "../../../db/schema";
import { putFile, deleteFile } from "../../../lib/storage";
import { getAppIdentity } from "../../authz";
import { findNearestBranch, findClosestBranch } from "../../../lib/geo-utils";
import { getEffectiveRules } from "../../../lib/rules";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET() {
  const identity = await getAppIdentity();
  if (!identity || identity.role !== "admin") {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = getDb();
  const records = db
    .select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      name: employees.name,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      office: attendance.office,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .innerJoin(employees, eq(attendance.employeeId, employees.id))
    .orderBy(desc(attendance.serverTimestamp))
    .limit(100)
    .all();

  return Response.json({ records });
}

export async function POST(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const form = await request.formData();
  const photo = form.get("photo");
  const employeeId = identity.employeeId;
  const punchType = form.get("punchType") === "OUT" ? "OUT" : "IN";

  if (!employeeId || !(photo instanceof File)) {
    return Response.json(
      { error: "Employee and selfie are required." },
      { status: 400 },
    );
  }
  if (!allowedImageTypes.has(photo.type) || photo.size > 5 * 1024 * 1024) {
    return Response.json(
      { error: "Use a JPEG, PNG or WebP selfie under 5 MB." },
      { status: 400 },
    );
  }

  const db = getDb();

  const employee = db
    .select({ id: employees.id, flexibleHours: employees.flexibleHours })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.active, true)))
    .get();
  if (!employee) {
    return Response.json(
      { error: "Active employee not found." },
      { status: 404 },
    );
  }

  // --- Geo-fence validation ---
  const latitude = form.get("latitude") as string | null;
  const longitude = form.get("longitude") as string | null;

  if (!latitude || !longitude) {
    return Response.json(
      { error: "Location access is required to mark attendance. Please enable GPS and try again." },
      { status: 400 },
    );
  }

  const empLat = parseFloat(latitude);
  const empLon = parseFloat(longitude);
  if (isNaN(empLat) || isNaN(empLon)) {
    return Response.json(
      { error: "Invalid GPS coordinates received." },
      { status: 400 },
    );
  }

  // Validate GPS accuracy — reject readings too inaccurate for geo-fencing.
  // Threshold is 200m: iOS devices indoors often report WiFi/cell-tower
  // positions with 150-200m accuracy that are still positionally valid.
  // The geo-fence check itself will still reject genuinely wrong positions.
  const accuracy = parseFloat(form.get("accuracy") as string || "0");
  if (accuracy > 200) {
    return Response.json(
      { error: `GPS accuracy is too low (±${Math.round(accuracy)}m). Please move to an open area or wait for a better GPS signal and try again.` },
      { status: 400 },
    );
  }

  // Validate GPS freshness — reject readings older than 60 seconds.
  // The web camera workflow (open camera → face detection → capture) can
  // easily take 30-40s, so a 30s threshold caused false rejections on
  // rapid flex-employee punch cycles.  60s is still tight enough that an
  // employee can't walk outside a 200m geo-fence in that window.
  const gpsTimestamp = parseFloat(form.get("gpsTimestamp") as string || "0");
  if (gpsTimestamp > 0 && Date.now() - gpsTimestamp > 60_000) {
    return Response.json(
      { error: "GPS location has expired. Please wait for a fresh GPS reading and try again." },
      { status: 400 },
    );
  }

  const allActiveBranches = db
    .select({ id: branches.id, name: branches.name, latitude: branches.latitude, longitude: branches.longitude, radius: branches.radius })
    .from(branches)
    .where(eq(branches.active, true))
    .all();

  // Filter to employee's assigned branches (if any); otherwise allow all
  const assignments = db
    .select({ branchId: employeeBranches.branchId })
    .from(employeeBranches)
    .where(eq(employeeBranches.employeeId, employeeId))
    .all();
  const assignedIds = new Set(assignments.map((a) => a.branchId));
  const activeBranches = assignedIds.size > 0
    ? allActiveBranches.filter((b) => assignedIds.has(b.id))
    : allActiveBranches;

  if (activeBranches.length === 0) {
    const assignedNames = assignedIds.size > 0
      ? allActiveBranches.filter((b) => assignedIds.has(b.id)).map((b) => b.name)
      : [];
    return Response.json(
      { error: assignedIds.size > 0
        ? `You are assigned to branch(es) that are currently inactive: ${assignedNames.join(", ") || "unknown"}. Please contact your administrator.`
        : "No office branches are configured. Please contact your administrator." },
      { status: 503 },
    );
  }

  const matchedBranch = findNearestBranch(empLat, empLon, activeBranches, accuracy);
  if (!matchedBranch) {
    const closest = findClosestBranch(empLat, empLon, activeBranches);
    const assignedBranchNames = assignedIds.size > 0
      ? activeBranches.map((b) => b.name).join(", ")
      : null;
    return Response.json(
      {
        error: assignedBranchNames
          ? `You are not within the geo-fence of your assigned branch(es): ${assignedBranchNames}. Please move closer and try again.`
          : "You are not within the geo-fence radius of any registered office. Please move closer to your office and try again.",
        geoAlert: closest ? {
          branchName: closest.name,
          distance: Math.round(closest.distance),
          allowedRadius: closest.radius,
        } : null,
      },
      { status: 403 },
    );
  }

  const office = matchedBranch.name;

  // Multi-cycle punch state machine
  const today = new Date().toISOString().slice(0, 10);
  const todayPunches = db
    .select({
      id: attendance.id,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, employeeId),
        sql`date(${attendance.serverTimestamp}) = ${today}`,
      ),
    )
    .orderBy(asc(attendance.serverTimestamp))
    .all();

  const lastPunch = todayPunches.length > 0 ? todayPunches[todayPunches.length - 1] : null;
  const firstIn = todayPunches.find((p) => p.punchType === "IN");

  if (punchType === "IN") {
    if (!lastPunch) {
      // First punch of the day — allowed
    } else if (lastPunch.punchType === "OUT") {
      // Re-entry attempt
      if (employee.flexibleHours) {
        // Flex/lecture employees can start a new session any time after punching out
      } else {
        // Regular employees: check lunch break rules
        const empRules = getEffectiveRules(employeeId);
        if (!empRules.lunch_break_enabled) {
          return Response.json(
            { error: "Re-entry is not enabled for your account. Contact your administrator." },
            { status: 403 },
          );
        }
        if (firstIn) {
          const firstInDate = new Date(firstIn.serverTimestamp.replace(" ", "T") + (firstIn.serverTimestamp.includes("Z") ? "" : "Z"));
          const hoursSinceFirstIn = (Date.now() - firstInDate.getTime()) / (1000 * 60 * 60);
          if (hoursSinceFirstIn < empRules.lunch_break_min_hours) {
            const remainingMin = Math.ceil(empRules.lunch_break_min_hours * 60 - hoursSinceFirstIn * 60);
            return Response.json(
              { error: `You must wait at least ${empRules.lunch_break_min_hours} hours after your first punch-in. Please try again in ${remainingMin} minutes.` },
              { status: 400 },
            );
          }
        }
      }
    } else {
      // Last punch was IN — already punched in
      return Response.json(
        { error: "You are already punched in." },
        { status: 409 },
      );
    }
  } else {
    // punchType === "OUT"
    if (!lastPunch || lastPunch.punchType === "OUT") {
      return Response.json(
        { error: lastPunch ? "You are already punched out. Punch in first." : "You must punch in before punching out." },
        { status: 400 },
      );
    }
    // Last punch was IN — allowed
  }

  const id = crypto.randomUUID();
  const photoKey = `attendance/${today}/${employeeId}/${id}.jpg`;

  putFile(photoKey, await photo.arrayBuffer(), { contentType: photo.type });

  try {
    db.insert(attendance)
      .values({
        id,
        employeeId,
        punchType: punchType as "IN" | "OUT",
        photoKey,
        contentType: photo.type,
        office,
        latitude,
        longitude,
        userAgent:
          request.headers.get("user-agent")?.slice(0, 300) || null,
      })
      .run();
  } catch (error) {
    deleteFile(photoKey);
    throw error;
  }

  const record = db
    .select({ serverTimestamp: attendance.serverTimestamp })
    .from(attendance)
    .where(eq(attendance.id, id))
    .get();

  return Response.json({ id, ...record }, { status: 201 });
}
