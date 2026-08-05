import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { branches } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";

export async function GET() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const db = getDb();
  const records = db
    .select({
      id: branches.id,
      name: branches.name,
      latitude: branches.latitude,
      longitude: branches.longitude,
    })
    .from(branches)
    .where(eq(branches.active, true))
    .all();

  return Response.json({ branches: records });
}
