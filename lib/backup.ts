import { resolve, relative, sep } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createTransport } from "nodemailer";

// ── Config ──────────────────────────────────────────────────────────────────
const DATA_DIR = resolve(process.cwd(), "data");
const DB_PATH = resolve(DATA_DIR, "attendance.db");
const UPLOADS_DIR = resolve(DATA_DIR, "uploads");
const BACKUP_DIR = resolve(DATA_DIR, "backups", "full");
const STATUS_FILE = resolve(DATA_DIR, "backups", "last-full-backup.json");
const LOCAL_KEEP = 8; // keep the 8 most recent full backups on the server
const DRIVE_FOLDER_NAME = "Attendly Backups";

// Columns left out of the readable Excel copy (they remain in the .db file)
const HIDDEN_COLUMNS: Record<string, string[]> = {
  employees: ["password"],
  sessions: ["token"],
  otp_requests: ["otp_code"],
};

const SHEET_NAMES: Record<string, string> = {
  employees: "Employees",
  attendance: "Attendance (raw)",
  leave_requests: "Leave Requests",
  miss_punch_requests: "Miss Punch Requests",
  holidays: "Holidays",
  holiday_employee_overrides: "Holiday Exceptions",
  daily_journals: "Daily Journals",
  departments: "Departments",
  branches: "Branches",
  employee_branches: "Employee Branches",
  attendance_rules: "Attendance Rules",
  employee_rule_overrides: "Employee Rule Overrides",
  activity_log: "Activity Log",
  sessions: "Login Sessions",
  otp_requests: "OTP Requests",
};

export type BackupStatus = {
  at: string;
  ok: boolean;
  trigger: "scheduled" | "manual";
  fileName?: string;
  sizeBytes?: number;
  photoCount?: number;
  tableCounts?: Record<string, number>;
  email: { status: "sent" | "skipped" | "failed"; detail: string };
  drive: { status: "uploaded" | "skipped" | "failed"; detail: string; link?: string };
  error?: string;
};

export function getBackupConfig() {
  const env = process.env;
  return {
    emailConfigured: !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && (env.BACKUP_EMAIL_TO || env.REPORT_EMAIL_TO)),
    emailTo: env.BACKUP_EMAIL_TO || env.REPORT_EMAIL_TO || "",
    driveConfigured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN),
  };
}

export function getLastBackupStatus(): BackupStatus | null {
  try {
    return JSON.parse(readFileSync(STATUS_FILE, "utf-8")) as BackupStatus;
  } catch {
    return null;
  }
}

let running = false;

/** Build a full backup zip, keep a local copy, then send it to email and Google Drive. */
export async function runFullBackup(trigger: BackupStatus["trigger"]): Promise<BackupStatus> {
  if (running) throw new Error("A backup is already running.");
  running = true;
  const status: BackupStatus = {
    at: new Date().toISOString(),
    ok: false,
    trigger,
    email: { status: "skipped", detail: "" },
    drive: { status: "skipped", detail: "" },
  };

  try {
    if (!existsSync(DB_PATH)) throw new Error(`Database not found at ${DB_PATH}`);
    mkdirSync(BACKUP_DIR, { recursive: true });

    const label = istLabel(new Date());
    const dbCopyPath = resolve(BACKUP_DIR, `${label}.db`);

    // Step 1: consistent DB snapshot (VACUUM INTO is safe while the app is running in WAL mode)
    const live = new Database(DB_PATH, { readonly: true });
    live.exec(`VACUUM INTO '${dbCopyPath.replace(/'/g, "''")}'`);
    live.close();

    // Step 2: readable Excel export of every table, from the snapshot
    const snapshot = new Database(dbCopyPath, { readonly: true });
    let xlsx: Buffer;
    try {
      const exported = await buildExcel(snapshot, label);
      xlsx = exported.buffer;
      status.tableCounts = exported.counts;
    } finally {
      snapshot.close();
    }
    const dbBuffer = readFileSync(dbCopyPath);
    unlinkSync(dbCopyPath);

    // Step 3: zip database + Excel + photos
    const photos = listFiles(UPLOADS_DIR);
    status.photoCount = photos.length;
    const readme = [
      `Attendly full backup (${label} IST)`,
      "",
      "attendance.db        Complete database. To restore: stop the app, replace data/attendance.db with this file, start the app.",
      "attendance-data.xlsx Every table in readable form (password hashes, login tokens and OTP codes omitted).",
      "uploads/             Attendance selfies and profile photos. To restore: copy into data/uploads/.",
    ].join("\r\n");

    const zip = new JSZip();
    zip.file("README.txt", readme);
    zip.file("attendance.db", dbBuffer);
    zip.file("attendance-data.xlsx", xlsx);
    for (const f of photos) {
      zip.file(`uploads/${relative(UPLOADS_DIR, f).split(sep).join("/")}`, readFileSync(f));
    }
    const fullZip = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

    const fileName = `attendly-backup_${label}.zip`;
    writeFileSync(resolve(BACKUP_DIR, fileName), fullZip);
    status.fileName = fileName;
    status.sizeBytes = fullZip.length;
    pruneLocalBackups();

    // Step 4: deliver. Each destination is independent; one failing doesn't stop the other.
    status.drive = await uploadToDrive(fileName, fullZip);
    status.email = await sendEmail(label, fileName, fullZip, xlsx, dbBuffer, readme, status);

    status.ok = status.email.status !== "failed" && status.drive.status !== "failed";
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  } finally {
    running = false;
    try {
      mkdirSync(resolve(DATA_DIR, "backups"), { recursive: true });
      writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
    } catch {
      // Status file is informational only
    }
  }
  return status;
}

// ── Excel export ────────────────────────────────────────────────────────────
async function buildExcel(db: InstanceType<typeof Database>, label: string) {
  const wb = new ExcelJS.Workbook();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations' ORDER BY name").all() as { name: string }[])
    .map((t) => t.name);
  const counts: Record<string, number> = {};

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ header: "Sheet", key: "s", width: 28 }, { header: "Rows", key: "r", width: 10 }];
  summary.getRow(1).font = { bold: true };

  // A readable attendance sheet first: IST date/time with employee names
  const punches = db.prepare(`
    SELECT a.employee_id, e.name, a.punch_type, a.server_timestamp, a.source, a.office
    FROM attendance a LEFT JOIN employees e ON e.id = a.employee_id
    ORDER BY a.server_timestamp
  `).all() as { employee_id: string; name: string | null; punch_type: string; server_timestamp: string; source: string; office: string }[];
  const readable = wb.addWorksheet("Attendance (IST)");
  readable.columns = [
    { header: "Date (IST)", key: "d", width: 12 },
    { header: "Time (IST)", key: "t", width: 10 },
    { header: "Employee ID", key: "id", width: 12 },
    { header: "Employee", key: "n", width: 24 },
    { header: "Punch", key: "p", width: 7 },
    { header: "Source", key: "s", width: 10 },
    { header: "Office", key: "o", width: 22 },
  ];
  readable.getRow(1).font = { bold: true };
  for (const p of punches) {
    const ist = toIST(p.server_timestamp);
    readable.addRow([ist.date, ist.time, p.employee_id, p.name ?? "", p.punch_type, p.source, p.office]);
  }
  readable.views = [{ state: "frozen", ySplit: 1 }];
  summary.addRow(["Attendance (IST)", punches.length]);

  const usedNames = new Set(["Summary", "Attendance (IST)"]);
  for (const table of tables) {
    const hidden = new Set(HIDDEN_COLUMNS[table] || []);
    const cols = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[])
      .map((c) => c.name)
      .filter((c) => !hidden.has(c));
    const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
    counts[table] = rows.length;

    let sheetName = (SHEET_NAMES[table] || table).slice(0, 31);
    while (usedNames.has(sheetName)) sheetName = `${sheetName.slice(0, 29)}_${usedNames.size}`;
    usedNames.add(sheetName);

    const sheet = wb.addWorksheet(sheetName);
    sheet.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(10, c.length + 2)) }));
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) sheet.addRow(cols.map((c) => r[c] ?? ""));
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    summary.addRow([sheetName, rows.length]);
  }
  summary.addRow([]);
  summary.addRow([`Backup taken ${label} IST`]);

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), counts };
}

// ── Email ───────────────────────────────────────────────────────────────────
async function sendEmail(
  label: string,
  fileName: string,
  fullZip: Buffer,
  xlsx: Buffer,
  dbBuffer: Buffer,
  readme: string,
  status: BackupStatus,
): Promise<BackupStatus["email"]> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  const { emailConfigured, emailTo } = getBackupConfig();
  if (!emailConfigured) return { status: "skipped", detail: "Not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS, BACKUP_EMAIL_TO)." };

  try {
    // Photos make the zip grow over time; past the mail size limit, email gets data only
    let zipAttachment = fullZip;
    let zipName = fileName;
    let photosNote = `All ${status.photoCount} photos are included in the zip.`;
    // Default 20 MB stays under typical 25 MB mail limits; BACKUP_EMAIL_MAX_MB overrides it
    const maxBytes = (Number(process.env.BACKUP_EMAIL_MAX_MB) || 20) * 1024 * 1024;
    if (fullZip.length + xlsx.length > maxBytes) {
      const dataZip = new JSZip();
      dataZip.file("README.txt", readme.replace(/\r\nuploads\/.*$/, ""));
      dataZip.file("attendance.db", dbBuffer);
      zipAttachment = await dataZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      zipName = fileName.replace(".zip", "_data-only.zip");
      photosNote = `Photos are not attached because the full backup (${formatBytes(fullZip.length)}) is over the email size limit. ${status.drive.status === "uploaded" ? "The full backup with photos is in Google Drive." : "The full backup with photos is saved on the server in data/backups/full/."}`;
    }

    const port = parseInt(SMTP_PORT || "587", 10);
    const transporter = createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    const counts = status.tableCounts || {};
    const html = `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
  <div style="background:#6D45E5;padding:16px 24px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;">Attendly weekly backup</h2>
    <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;">${label.replace("_", " ").replace(/-(\d\d)$/, ":$1")} IST</p>
  </div>
  <div style="padding:16px 24px;font-size:14px;line-height:1.6;border:1px solid #eee;border-top:0;">
    <p style="margin:0 0 10px;"><b>Attached:</b> attendance-data.xlsx (all tables, readable) and ${zipName} (full database${zipAttachment === fullZip ? " + photos" : ""}).</p>
    <p style="margin:0 0 10px;">${photosNote}</p>
    <p style="margin:0 0 10px;">Employees: <b>${counts.employees ?? 0}</b> &nbsp;|&nbsp; Attendance punches: <b>${counts.attendance ?? 0}</b> &nbsp;|&nbsp; Leave requests: <b>${counts.leave_requests ?? 0}</b> &nbsp;|&nbsp; Holidays: <b>${counts.holidays ?? 0}</b></p>
    <p style="margin:0;color:#667085;font-size:12px;">Google Drive: ${status.drive.status === "uploaded" ? "uploaded" : status.drive.status === "failed" ? "upload FAILED: " + escapeHtml(status.drive.detail) : "not configured"}. Keep this email private: it contains employee personal data.</p>
  </div>
</div>`;

    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: emailTo,
      subject: `Attendly backup - ${label.slice(0, 10)}`,
      html,
      attachments: [
        { filename: "attendance-data.xlsx", content: xlsx },
        { filename: zipName, content: zipAttachment },
      ],
    });
    return { status: "sent", detail: `Sent to ${emailTo}${zipAttachment === fullZip ? "" : " (data only, photos too large for email)"}.` };
  } catch (err) {
    return { status: "failed", detail: err instanceof Error ? err.message : String(err) };
  }
}

// ── Google Drive (OAuth refresh token, drive.file scope) ────────────────────
async function getDriveAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google sign-in failed: ${data.error_description || data.error || res.status}. Run "npm run backup:google-auth" again to get a new refresh token.`);
  }
  return data.access_token;
}

async function getOrCreateDriveFolder(token: string): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };
  const q = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, { headers: auth });
  const foundData = (await found.json()) as { files?: { id: string }[] };
  if (foundData.files?.[0]) return foundData.files[0].id;

  const created = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  const createdData = (await created.json()) as { id?: string; error?: { message: string } };
  if (!created.ok || !createdData.id) throw new Error(`Could not create Drive folder: ${createdData.error?.message || created.status}`);
  return createdData.id;
}

async function uploadToDrive(fileName: string, body: Buffer): Promise<BackupStatus["drive"]> {
  if (!getBackupConfig().driveConfigured) {
    return { status: "skipped", detail: "Not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)." };
  }
  try {
    const token = await getDriveAccessToken();
    const folderId = await getOrCreateDriveFolder(token);

    // Resumable upload works for any file size
    const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/zip",
        "X-Upload-Content-Length": String(body.length),
      },
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    });
    const uploadUrl = init.headers.get("location");
    if (!init.ok || !uploadUrl) throw new Error(`Drive upload could not start (${init.status}): ${await init.text()}`);

    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: new Uint8Array(body) });
    const putData = (await put.json()) as { id?: string; webViewLink?: string; error?: { message: string } };
    if (!put.ok || !putData.id) throw new Error(`Drive upload failed: ${putData.error?.message || put.status}`);

    return { status: "uploaded", detail: `Uploaded to "${DRIVE_FOLDER_NAME}" in Google Drive.`, link: putData.webViewLink };
  } catch (err) {
    return { status: "failed", detail: err instanceof Error ? err.message : String(err) };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function istLabel(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())}_${p(ist.getUTCHours())}-${p(ist.getUTCMinutes())}`;
}

function toIST(ts: string): { date: string; time: string } {
  const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return { date: ts, time: "" };
  const [date, time] = istLabel(d).split("_");
  return { date, time: time.replace("-", ":") };
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function pruneLocalBackups(): void {
  const zips = readdirSync(BACKUP_DIR)
    .filter((f) => /^attendly-backup_.*\.zip$/.test(f))
    .sort((a, b) => statSync(resolve(BACKUP_DIR, b)).mtimeMs - statSync(resolve(BACKUP_DIR, a)).mtimeMs);
  for (const f of zips.slice(LOCAL_KEEP)) unlinkSync(resolve(BACKUP_DIR, f));
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
