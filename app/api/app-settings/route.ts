import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appSettings } from "../../../db/schema";
import { getAppIdentity, requireApiRole } from "../../authz";
import { logActivity } from "../../../lib/activity-logger";

const FORM_URL_KEY = "employee_form_url";
const FORM_LABEL_KEY = "employee_form_label";
const DEFAULT_FORM_LABEL = "Employee information form";
const MAX_LABEL_LENGTH = 80;
/** Longer than any real form link, and short enough to never bloat a profile load. */
const MAX_URL_LENGTH = 2000;
const INVALID_LINK_ERROR = "Enter a valid http(s) link.";

/**
 * The one gate the stored link has to pass, applied on the way IN and on the way
 * OUT again.
 *
 * It returns the URL parser's own canonical form, so the exact string that was
 * checked is the string that gets stored and later rendered as an href — there is
 * no room for a value the checker reads one way ("java\tscript:" parses as
 * javascript:) and the stored text another.
 *
 * Reading through it as well is deliberate. PATCH is not the only way a row can
 * appear: a direct sqlite write, a restored backup or a future migration all
 * bypass it, and whatever sits in that row becomes a clickable link on 71
 * employees' screens. A bare "example.com" has no protocol and fails to parse;
 * javascript:, data:, file: and vbscript: parse but fail the protocol check.
 * Anything that is not a plain http(s) address comes back as "" and every
 * surface then shows nothing at all.
 */
function safeFormUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

/**
 * One line of plain text for the link. Control and formatting characters are
 * replaced rather than kept: a newline or a right-to-left override inside the
 * label would otherwise deform the link on every employee's Profile.
 */
function safeFormLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_LABEL_LENGTH)
    .trim();
}

/** The single place the two keys are turned into the shape every client reads. */
function readSettings(db: ReturnType<typeof getDb>) {
  const rows = db.select().from(appSettings).all();
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  return {
    employeeFormUrl: safeFormUrl(stored.get(FORM_URL_KEY)),
    employeeFormLabel: safeFormLabel(stored.get(FORM_LABEL_KEY)) || DEFAULT_FORM_LABEL,
  };
}

function upsertSetting(db: ReturnType<typeof getDb>, key: string, value: string) {
  const existing = db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();

  const updatedAt = new Date().toISOString();
  if (existing) {
    db.update(appSettings).set({ value, updatedAt }).where(eq(appSettings.key, key)).run();
  } else {
    db.insert(appSettings).values({ key, value, updatedAt }).run();
  }
}

export async function GET() {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  return Response.json({ settings: readSettings(getDb()) });
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  // `null` and a bare string are both valid JSON; reading a field off them would
  // throw and turn a bad request into a 500.
  if (typeof parsed !== "object" || parsed === null) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = parsed as { employeeFormUrl?: unknown; employeeFormLabel?: unknown };

  const updates: Array<{ key: string; value: string }> = [];
  const changes: string[] = [];

  if (body.employeeFormUrl !== undefined) {
    if (typeof body.employeeFormUrl !== "string") {
      return Response.json({ error: INVALID_LINK_ERROR }, { status: 400 });
    }
    // Only an empty string clears the link; everything else must survive the gate.
    const clearing = body.employeeFormUrl.trim() === "";
    const url = clearing ? "" : safeFormUrl(body.employeeFormUrl);
    if (!clearing && !url) {
      return Response.json({ error: INVALID_LINK_ERROR }, { status: 400 });
    }
    updates.push({ key: FORM_URL_KEY, value: url });
    changes.push(url ? "set the employee information form link" : "removed the employee information form link");
  }

  if (body.employeeFormLabel !== undefined) {
    if (typeof body.employeeFormLabel !== "string") {
      return Response.json({ error: "Enter a valid label." }, { status: 400 });
    }
    const label = safeFormLabel(body.employeeFormLabel) || DEFAULT_FORM_LABEL;
    updates.push({ key: FORM_LABEL_KEY, value: label });
    changes.push(`set the form link label to "${label}"`);
  }

  if (updates.length === 0) {
    return Response.json({ error: "No updates provided." }, { status: 400 });
  }

  const db = getDb();
  for (const update of updates) {
    upsertSetting(db, update.key, update.value);
  }

  // Read back through the same gate the employees' GET uses, so the admin screen
  // and the employee screen can never disagree about what is stored.
  const settings = readSettings(db);

  logActivity({
    actionType: "app_settings_updated",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    description: `${auth.identity.displayName} ${changes.join(" and ")}`,
    metadata: settings,
  });

  return Response.json({ ok: true, settings });
}
