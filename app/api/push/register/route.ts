import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { pushTokens } from "../../../../db/schema";
import { getAppIdentity } from "../../../authz";

/**
 * Register this device for push.
 *
 * Not admin-gated: employees receive their own punch confirmations and request
 * decisions, so any signed-in account may register. The token is the primary
 * key, so a shared phone re-points its existing row at whoever signed in last
 * rather than accumulating duplicates — otherwise the previous employee would
 * keep receiving the new one's notifications.
 */
export async function POST(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { token?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return Response.json({ error: "token is required." }, { status: 400 });
  }
  const platform = body.platform === "ios" ? "ios" : "android";
  const now = new Date().toISOString();

  const db = getDb();
  const existing = db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.token, token))
    .get();

  if (existing) {
    db.update(pushTokens)
      .set({ employeeId: identity.employeeId, platform, updatedAt: now })
      .where(eq(pushTokens.token, token))
      .run();
  } else {
    db.insert(pushTokens)
      .values({ token, employeeId: identity.employeeId, platform, updatedAt: now })
      .run();
  }

  return Response.json({ ok: true });
}

/** Sign-out: stop this device receiving anything for the account that left. */
export async function DELETE(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return Response.json({ error: "token is required." }, { status: 400 });
  }

  const db = getDb();
  db.delete(pushTokens).where(eq(pushTokens.token, token)).run();
  return Response.json({ ok: true });
}
