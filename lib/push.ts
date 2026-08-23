import { createSign } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { employees, pushTokens } from "../db/schema";

/**
 * Firebase Cloud Messaging, HTTP v1.
 *
 * Deliberately dependency-free: this project is deployed by hand, so pulling in
 * google-auth-library would mean an npm install on the server for one JWT. Node's
 * crypto signs the assertion and we exchange it for an access token directly.
 *
 * Everything here is a no-op when FCM_SERVICE_ACCOUNT is unset, so a server
 * without Firebase configured keeps working exactly as before — a login code is
 * still created, it simply is not pushed.
 *
 * Configure with one environment variable:
 *   FCM_SERVICE_ACCOUNT = the full service-account JSON, on one line
 * Generate it in Firebase console → Project settings → Service accounts →
 * "Generate new private key".
 */

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type PushMessage = {
  title: string;
  body: string;
  /** Read by the app to decide which screen a tap opens. */
  data?: Record<string, string>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    // Escaped newlines survive most env-var transports; real ones do not.
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    console.warn("[push] FCM_SERVICE_ACCOUNT is not valid JSON; push is disabled");
    return null;
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Exchange a signed JWT for an OAuth access token, cached until just before expiry. */
async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(sa.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    console.warn("[push] token exchange failed:", res.status, await res.text());
    return null;
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/**
 * Push to specific devices.
 *
 * A `notification` block is sent rather than data-only so Android displays it
 * even when the app process is dead — which is the entire point. `data` rides
 * along for tap routing, and the channel is named so it inherits the app's
 * PRIVATE lockscreen setting instead of Android's default.
 */
async function sendToTokens(tokens: string[], message: PushMessage): Promise<void> {
  const sa = serviceAccount();
  if (!sa || tokens.length === 0) return;

  const token = await accessToken(sa);
  if (!token) return;

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const dead: string[] = [];

  // FCM v1 takes one token per request. An office has a handful of admin
  // devices, so a simple loop is fine; batch if that ever changes.
  await Promise.all(
    tokens.map(async (deviceToken) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: deviceToken,
              notification: { title: message.title, body: message.body },
              data: message.data ?? {},
              android: {
                priority: "high",
                notification: { channel_id: "attendly-default" },
              },
            },
          }),
        });

        if (res.status === 404 || res.status === 400) {
          // UNREGISTERED / invalid: the app was uninstalled or the token rotated.
          dead.push(deviceToken);
        } else if (!res.ok) {
          console.warn("[push] send failed:", res.status, await res.text());
        }
      } catch (e) {
        console.warn("[push] send threw:", e instanceof Error ? e.message : e);
      }
    }),
  );

  if (dead.length) {
    const db = getDb();
    for (const t of dead) {
      db.delete(pushTokens).where(eq(pushTokens.token, t)).run();
    }
  }
}

/** Push to every device registered to any of these employees. */
export async function sendToEmployees(employeeIds: string[], message: PushMessage) {
  if (!employeeIds.length) return;
  const db = getDb();
  const rows = db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(inArray(pushTokens.employeeId, employeeIds))
    .all();
  await sendToTokens(rows.map((r) => r.token), message);
}

/** Push to every admin — used for login codes and other things needing a human. */
export async function sendToAdmins(message: PushMessage) {
  const db = getDb();
  const admins = db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.role, "admin"))
    .all();
  await sendToEmployees(admins.map((a) => a.id), message);
}
