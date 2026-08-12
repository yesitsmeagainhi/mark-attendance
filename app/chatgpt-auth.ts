import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { employees, sessions } from "../db/schema";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  if (!sessionToken) return null;

  const db = getDb();
  const session = db
    .select({ employeeId: sessions.employeeId })
    .from(sessions)
    .where(eq(sessions.token, sessionToken))
    .limit(1)
    .get();

  if (!session) return null;

  const record = db
    .select({
      name: employees.name,
      email: employees.email,
    })
    .from(employees)
    .where(eq(employees.id, session.employeeId))
    .limit(1)
    .get();

  if (!record) return null;

  return {
    displayName: record.name,
    email: record.email,
    fullName: record.name,
  };
}

export async function requireChatGPTUser(
  _returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect("/login");
}
