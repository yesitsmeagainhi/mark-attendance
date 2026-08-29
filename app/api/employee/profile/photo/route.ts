import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { employees } from "../../../../../db/schema";
import { getAppIdentity } from "../../../../authz";
import { putFile, getFile, deleteFile } from "../../../../../lib/storage";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// expo-file-system's File reports "application/octet-stream" or "" instead of
// a real MIME type. Fall back to the filename extension in those cases.
function resolveMimeType(photo: File): string | null {
  if (ALLOWED_TYPES.has(photo.type)) return photo.type;
  const ext = (photo.name.split(".").pop() ?? "").toLowerCase();
  const MAP: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return MAP[ext] ?? null;
}

/** GET /api/employee/profile/photo — serve the authenticated employee's profile photo */
export async function GET() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const db = getDb();
  const emp = db
    .select({ profilePhotoKey: employees.profilePhotoKey })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  if (!emp?.profilePhotoKey) {
    return Response.json({ error: "No profile photo." }, { status: 404 });
  }

  const stored = getFile(emp.profilePhotoKey);
  if (!stored) {
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }

  return new Response(new Uint8Array(stored.body), {
    headers: {
      "Content-Type": stored.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** POST /api/employee/profile/photo — upload or replace profile photo */
export async function POST(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const form = await request.formData();
  const photo = form.get("photo");

  if (!photo || typeof photo === "string") {
    return Response.json({ error: "photo field is required (multipart/form-data)." }, { status: 400 });
  }
  const mimeType = resolveMimeType(photo as File);
  if (!mimeType) {
    return Response.json({ error: "Only JPEG, PNG or WebP images are allowed." }, { status: 400 });
  }
  if (photo.size > MAX_SIZE) {
    return Response.json({ error: "Image must be under 5 MB." }, { status: 400 });
  }

  const db = getDb();

  // Delete any existing profile photo first
  const existing = db
    .select({ profilePhotoKey: employees.profilePhotoKey })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  if (existing?.profilePhotoKey) {
    deleteFile(existing.profilePhotoKey);
  }

  // Derive extension from resolved MIME type
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const key = `profiles/${identity.employeeId}/photo.${ext}`;

  putFile(key, await photo.arrayBuffer(), { contentType: mimeType });

  db.update(employees)
    .set({ profilePhotoKey: key })
    .where(eq(employees.id, identity.employeeId))
    .run();

  const photoUrl = `/api/employee/profile/photo`;

  return Response.json({ photoUrl }, { status: 201 });
}

/** DELETE /api/employee/profile/photo — remove profile photo */
export async function DELETE() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const db = getDb();
  const emp = db
    .select({ profilePhotoKey: employees.profilePhotoKey })
    .from(employees)
    .where(eq(employees.id, identity.employeeId))
    .get();

  if (emp?.profilePhotoKey) {
    deleteFile(emp.profilePhotoKey);
    db.update(employees)
      .set({ profilePhotoKey: null })
      .where(eq(employees.id, identity.employeeId))
      .run();
  }

  return Response.json({ ok: true });
}
