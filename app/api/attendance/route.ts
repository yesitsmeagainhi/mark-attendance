import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { attendance, employees } from "../../../db/schema";
import { putFile, deleteFile } from "../../../lib/storage";
import { requireApiRole } from "../../authz";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

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
  const auth = await requireApiRole("employee");
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const photo = form.get("photo");
  const employeeId = auth.identity.employeeId;
  const punchType = form.get("punchType") === "OUT" ? "OUT" : "IN";
  const office = String(form.get("office") || "Airoli Office").slice(0, 100);

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
        latitude: (form.get("latitude") as string) || null,
        longitude: (form.get("longitude") as string) || null,
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
