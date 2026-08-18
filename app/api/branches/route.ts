import { eq, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { branches } from "../../../db/schema";
import { requireApiRole } from "../../authz";

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const db = getDb();
  const records = db
    .select()
    .from(branches)
    .orderBy(desc(branches.createdAt))
    .all();

  return Response.json({ branches: records });
}

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { name?: string; latitude?: string; longitude?: string; radius?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim();
  const latitude = body.latitude?.trim();
  const longitude = body.longitude?.trim();
  const radius = Math.max(50, Math.min(5000, Math.round(Number(body.radius) || 200)));

  if (!name || name.length < 2) {
    return Response.json({ error: "Branch name is required (minimum 2 characters)." }, { status: 400 });
  }

  const lat = parseFloat(latitude || "");
  const lon = parseFloat(longitude || "");
  if (isNaN(lat) || lat < -90 || lat > 90) {
    return Response.json({ error: "Valid latitude is required (-90 to 90)." }, { status: 400 });
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    return Response.json({ error: "Valid longitude is required (-180 to 180)." }, { status: 400 });
  }

  const db = getDb();

  const existing = db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.name, name))
    .limit(1)
    .get();
  if (existing) {
    return Response.json({ error: "A branch with this name already exists." }, { status: 409 });
  }

  const id = crypto.randomUUID();
  db.insert(branches)
    .values({ id, name, latitude: lat.toString(), longitude: lon.toString(), radius })
    .run();

  return Response.json({ id, name }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let body: { id?: string; name?: string; latitude?: string; longitude?: string; radius?: number; active?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const branchId = body.id?.trim();
  if (!branchId) {
    return Response.json({ error: "Branch ID is required." }, { status: 400 });
  }

  const db = getDb();
  const existing = db.select().from(branches).where(eq(branches.id, branchId)).get();
  if (!existing) {
    return Response.json({ error: "Branch not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2) {
      return Response.json({ error: "Branch name must be at least 2 characters." }, { status: 400 });
    }
    const dup = db.select({ id: branches.id }).from(branches).where(eq(branches.name, name)).limit(1).get();
    if (dup && dup.id !== branchId) {
      return Response.json({ error: "A branch with this name already exists." }, { status: 409 });
    }
    updates.name = name;
  }
  if (body.latitude !== undefined) {
    const lat = parseFloat(body.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return Response.json({ error: "Valid latitude required." }, { status: 400 });
    }
    updates.latitude = lat.toString();
  }
  if (body.longitude !== undefined) {
    const lon = parseFloat(body.longitude);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      return Response.json({ error: "Valid longitude required." }, { status: 400 });
    }
    updates.longitude = lon.toString();
  }
  if (body.radius !== undefined) {
    const r = Math.round(Number(body.radius));
    if (isNaN(r) || r < 50 || r > 5000) {
      return Response.json({ error: "Radius must be between 50 and 5000 meters." }, { status: 400 });
    }
    updates.radius = r;
  }
  if (body.active !== undefined) {
    updates.active = body.active;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No updates provided." }, { status: 400 });
  }

  db.update(branches).set(updates).where(eq(branches.id, branchId)).run();
  return Response.json({ ok: true });
}
