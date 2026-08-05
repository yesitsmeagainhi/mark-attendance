import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { attendance, employees, branches } from "../../../db/schema";
import { putFile, deleteFile } from "../../../lib/storage";
import { getAppIdentity } from "../../authz";
import { findNearestBranch } from "../../../lib/geo-utils";

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
    .select({ id: branches.id, name: branches.name, latitude: branches.latitude, longitude: branches.longitude })
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
    return Response.json(
      { error: "You are not within 200 meters of any registered office. Please move closer to your office and try again." },
      { status: 403 },
    );
  }

  const office = matchedBranch.name;

  const today = new Date().toISOString().slice(0, 10);
  const duplicate = db
    .select({ id: attendance.id })
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, employeeId),
        eq(attendance.punchType, punchType as "IN" | "OUT"),
        sql`date(${attendance.serverTimestamp}) = ${today}`,
      ),
    )
    .limit(1)
    .get();
  if (duplicate) {
    return Response.json(
      {
        error: `Today's punch ${punchType.toLowerCase()} is already recorded.`,
      },
      { status: 409 },
    );
  }

  // Punch OUT requires a prior punch IN today
  if (punchType === "OUT") {
    const hasPunchIn = db
      .select({ id: attendance.id })
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeId),
          eq(attendance.punchType, "IN"),
          sql`date(${attendance.serverTimestamp}) = ${today}`,
        ),
      )
      .limit(1)
      .get();
    if (!hasPunchIn) {
      return Response.json(
        { error: "You must punch in before punching out." },
        { status: 400 },
      );
    }
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
