import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { employees } from "../db/schema";

export type AppIdentity = {
  email: string;
  displayName: string;
  employeeId: string;
  role: "employee" | "admin";
  office: string;
};

export async function getAppIdentity(): Promise<AppIdentity | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  if (!sessionId) return null;

  const db = getDb();
  const record = db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: employees.role,
      office: employees.office,
    })
    .from(employees)
    .where(eq(employees.id, sessionId))
    .limit(1)
    .get();

  if (!record) return null;

  return {
    email: record.email,
    displayName: record.name,
    employeeId: record.id,
    role: record.role === "admin" ? "admin" : "employee",
    office: record.office,
  };
}

export async function requireApiRole(role: "employee" | "admin") {
  const identity = await getAppIdentity();
  if (!identity) {
    return {
      error: Response.json(
        { error: "Sign in with an authorized account." },
        { status: 401 },
      ),
    } as const;
  }
  if (identity.role !== role) {
    return {
      error: Response.json(
        { error: "You do not have permission to access this resource." },
        { status: 403 },
      ),
    } as const;
  }
  return { identity } as const;
}
