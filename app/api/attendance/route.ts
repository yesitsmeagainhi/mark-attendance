import { eq, and, sql, desc, asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { attendance, employees, branches } from "../../../db/schema";
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
    .select({ id: employees.id })
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

  const activeBranches = db
    .select({ id: branches.id, name: branches.name, latitude: branches.latitude, longitude: branches.longitude, radius: branches.radius })
    .from(branches)
    .where(eq(branches.active, true))
    .all();

  if (activeBranches.length === 0) {
    return Response.json(
      { error: "No office branches are configured. Please contact your administrator." },
      { status: 503 },
    );
  }

  const matchedBranch = findNearestBranch(empLat, empLon, activeBranches);
  if (!matchedBranch) {
    const closest = findClosestBranch(empLat, empLon, activeBranches);
    return Response.json(
      {
        error: "You are not within the geo-fence radius of any registered office. Please move closer to your office and try again.",
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
      // Re-entry attempt — check lunch break rules
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
