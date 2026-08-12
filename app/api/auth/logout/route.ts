import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sessions } from "../../../../db/schema";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (token) {
    const db = getDb();
    db.delete(sessions).where(eq(sessions.token, token)).run();
  }

  cookieStore.delete("session");
  return Response.json({ ok: true });
}
