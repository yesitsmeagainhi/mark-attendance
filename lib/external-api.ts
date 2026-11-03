import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Read-only attendance feed for an outside website panel.
 * Set in the server's .env (restart the app after changing):
 *   EXTERNAL_API_KEY=<long random string>        the website sends this as a Bearer token
 *   EXTERNAL_API_EMPLOYEES=EMP-1001,EMP-1002     only these employees are shared
 * The endpoint answers 404 while EXTERNAL_API_KEY is unset.
 */
export function externalApiKey(): string | null {
  const key = process.env.EXTERNAL_API_KEY?.trim();
  return key ? key : null;
}

export function sharedEmployeeIds(): string[] {
  return (process.env.EXTERNAL_API_EMPLOYEES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Constant-time check of the key sent as `Authorization: Bearer <key>` or `x-api-key`. */
export function isValidExternalKey(request: Request, expected: string): boolean {
  const auth = request.headers.get("authorization") || "";
  const sent = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : (request.headers.get("x-api-key") || "").trim();
  if (!sent) return false;
  const a = createHash("sha256").update(sent).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
