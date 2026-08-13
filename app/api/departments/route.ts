import { eq, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { departments } from "../../../db/schema";
import { requireApiRole } from "../../authz";

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const db = getDb();
  const records = db
    .select()
    .from(departments)
    .orderBy(desc(departments.createdAt))
    .all();

  return Response.json({ departments: records });
}

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim();

  if (!name || name.length < 2) {
    return Response.json({ error: "Department name is required (minimum 2 characters)." }, { status: 400 });
  }

  const db = getDb();

  const existing = db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.name, name))
    .limit(1)
    .get();
  if (existing) {
    return Response.json({ error: "A department with this name already exists." }, { status: 409 });
  }

  const id = crypto.randomUUID();
  db.insert(departments)
    .values({ id, name })
    .run();

  return Response.json({ id, name }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { id?: string; name?: string; active?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const deptId = body.id?.trim();
  if (!deptId) {
    return Response.json({ error: "Department ID is required." }, { status: 400 });
  }

  const db = getDb();
  const existing = db.select().from(departments).where(eq(departments.id, deptId)).get();
  if (!existing) {
    return Response.json({ error: "Department not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2) {
      return Response.json({ error: "Department name must be at least 2 characters." }, { status: 400 });
    }
    const dup = db.select({ id: departments.id }).from(departments).where(eq(departments.name, name)).limit(1).get();
    if (dup && dup.id !== deptId) {
      return Response.json({ error: "A department with this name already exists." }, { status: 409 });
    }
    updates.name = name;
  }
  if (body.active !== undefined) {
    updates.active = body.active;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No updates provided." }, { status: 400 });
  }

  db.update(departments).set(updates).where(eq(departments.id, deptId)).run();
  return Response.json({ ok: true });
}
