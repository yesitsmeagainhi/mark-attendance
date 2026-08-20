import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sessions } from "../../../../db/schema";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  let token = cookieStore.get("session")?.value ?? null;

  // Also check Authorization: Bearer <token> header (mobile app)
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (token) {
    const db = getDb();
    db.delete(sessions).where(eq(sessions.token, token)).run();
  }

  cookieStore.delete("session");
  return Response.json({ ok: true });
}
