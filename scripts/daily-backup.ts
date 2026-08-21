import { resolve } from "node:path";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { createTransport } from "nodemailer";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { employees, attendance, leaveRequests, holidays } from "../db/schema";
import { getEffectiveRulesBatch } from "../lib/rules";
import { calculateTotalDuration, calculateBreakDuration, formatTimeIST, formatDuration } from "../lib/time-utils";

// ── Config ──────────────────────────────────────────────────────────────────
const DB_PATH = resolve(process.cwd(), "data", "attendance.db");
const BACKUP_DIR = resolve(process.cwd(), "data", "backups");
const RETENTION_DAYS = 30;

// ── Types ───────────────────────────────────────────────────────────────────
type EmployeeReport = {
  name: string;
  shift: string;
  office: string;
  punchIn: string | null;
  punchOut: string | null;
  durationMinutes: number | null;
  breakMinutes: number | null;
  status: string;
};

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const dateStr = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, "0")}-${String(istNow.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(istNow.getHours()).padStart(2, "0")}-${String(istNow.getMinutes()).padStart(2, "0")}`;
  const label = `${dateStr}_${timeStr}`;

  console.log(`[${label}] Starting daily backup and report...`);

  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Step 1: Database backup
  backupDatabase(label);

  // Step 2: Generate report data
  const reportData = generateReportData(dateStr);

  // Step 3: Save CSV
  saveCsvReport(label, reportData);

  // Step 4: Send email
  await sendEmailReport(dateStr, label, reportData);

  // Step 5: Cleanup old backups
  cleanupOldBackups();

  console.log(`[${label}] Done.`);
}

// ── Database Backup (VACUUM INTO for WAL-safe copy) ─────────────────────────
function backupDatabase(label: string): void {
  const backupPath = resolve(BACKUP_DIR, `${label}.db`);

  if (!existsSync(DB_PATH)) {
    console.warn("  Database file not found at", DB_PATH);
    return;
  }

  // VACUUM INTO creates a clean, self-contained backup even with WAL mode active
  const sqlite = new Database(DB_PATH, { readonly: true });
  sqlite.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  sqlite.close();

  console.log(`  DB backed up to ${backupPath}`);
}

// ── Generate Report Data ────────────────────────────────────────────────────
function generateReportData(todayStr: string): EmployeeReport[] {
  const db = getDb();

  // Get all active non-admin employees
  const allEmployees = db
    .select({
      id: employees.id,
      name: employees.name,
      workStartTime: employees.workStartTime,
      workEndTime: employees.workEndTime,
      office: employees.office,
      flexibleHours: employees.flexibleHours,
    })
    .from(employees)
    .where(and(eq(employees.active, true), sql`${employees.role} != 'admin'`))
    .orderBy(employees.name)
    .all();

  // Get today's attendance records
  const records = db
    .select({
      employeeId: attendance.employeeId,
      punchType: attendance.punchType,
      serverTimestamp: attendance.serverTimestamp,
      photoKey: attendance.photoKey,
    })
    .from(attendance)
    .where(sql`date(${attendance.serverTimestamp}) = ${todayStr}`)
    .all();

  // Group by employee
  const empPunchMap = new Map<string, { punchType: string; serverTimestamp: string }[]>();
  for (const r of records) {
    if (!empPunchMap.has(r.employeeId)) empPunchMap.set(r.employeeId, []);
    empPunchMap.get(r.employeeId)!.push({ punchType: r.punchType, serverTimestamp: r.serverTimestamp });
  }

  // Check if today is a holiday
  const isHoliday = db
    .select({ date: holidays.date })
    .from(holidays)
    .where(eq(holidays.date, todayStr))
    .limit(1)
    .all().length > 0;

  // Check approved leaves covering today
  const approvedLeaves = db
    .select({ employeeId: leaveRequests.employeeId })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.fromDate, todayStr),
      gte(leaveRequests.toDate, todayStr),
    ))
    .all();
  const onLeave = new Set(approvedLeaves.map(l => l.employeeId));

  // Check if today is a Sunday
  const [yr, mn, dy] = todayStr.split("-").map(Number);
  const isSunday = new Date(yr, mn - 1, dy).getDay() === 0;

  const rulesByEmp = getEffectiveRulesBatch(allEmployees.map(e => e.id));

  return allEmployees.map(emp => {
    const punches = (empPunchMap.get(emp.id) || [])
      .sort((a, b) => a.serverTimestamp.localeCompare(b.serverTimestamp));

    // Find earliest IN and latest OUT
    const inPunches = punches.filter(p => p.punchType === "IN");
    const outPunches = punches.filter(p => p.punchType === "OUT");
    const firstIn = inPunches.length > 0 ? inPunches[0].serverTimestamp : null;
    const lastOut = outPunches.length > 0 ? outPunches[outPunches.length - 1].serverTimestamp : null;

    // Calculate duration and break
    let durationMinutes: number | null = null;
    let breakMinutes: number | null = null;
    if (punches.length > 0) {
      const dur = calculateTotalDuration(punches);
      if (dur > 0) durationMinutes = dur;
      const brk = calculateBreakDuration(punches);
      if (brk > 0) breakMinutes = brk;
    }

    // Determine status
    let status = "Absent";

    if (isSunday) {
      status = punches.length > 0 ? "Overtime" : "Sunday";
    } else if (isHoliday) {
      status = "Holiday";
    } else if (onLeave.has(emp.id)) {
      status = "Leave";
    } else if (firstIn && lastOut) {
      const empRules = rulesByEmp.get(emp.id)!;
      const [startH, startM] = emp.workStartTime.split(":").map(Number);
      const graceMin = startH * 60 + startM + empRules.grace_period;
      const halfDayMins = empRules.minimum_hours_for_half_day * 60;
      const fullDayMins = empRules.minimum_hours_for_full_day * 60;

      // Duration-based tier check
      if (!emp.flexibleHours && durationMinutes !== null) {
        if (durationMinutes < halfDayMins) {
          status = "Short Day";
        } else if (durationMinutes < fullDayMins) {
          status = "Half Day";
        } else {
          status = "Present";
        }
      } else {
        status = "Present";
      }

      // Late check (only if status is "Present")
      if (!emp.flexibleHours && status === "Present") {
        const punchDate = new Date(firstIn.replace(" ", "T") + (firstIn.includes("Z") ? "" : "Z"));
        const punchMin = ((punchDate.getUTCHours() + 5) * 60 + punchDate.getUTCMinutes() + 30) % (24 * 60);
        if (punchMin > graceMin) status = "Late";
      }
    } else if (firstIn && !lastOut) {
      // Punched in but not yet out — relevant for midday report
      status = "In Progress";
    }

    return {
      name: emp.name,
      shift: `${emp.workStartTime} - ${emp.workEndTime}`,
      office: emp.office,
      punchIn: firstIn,
      punchOut: lastOut,
      durationMinutes,
      breakMinutes,
      status,
    };
  });
}

// ── Save CSV Report ─────────────────────────────────────────────────────────
function saveCsvReport(label: string, data: EmployeeReport[]): void {
  const csvPath = resolve(BACKUP_DIR, `${label}-report.csv`);

  const headers = ["Employee", "Office", "Shift", "Punch In (IST)", "Punch Out (IST)", "Duration", "Break", "Status"];
  const rows = data.map(emp => [
    emp.name,
    emp.office,
    emp.shift,
    emp.punchIn ? formatTimeIST(emp.punchIn) : "-",
    emp.punchOut ? formatTimeIST(emp.punchOut) : "-",
    emp.durationMinutes ? formatDuration(emp.durationMinutes) : "-",
    emp.breakMinutes ? formatDuration(emp.breakMinutes) : "-",
    emp.status,
  ]);

  const csvContent = "\uFEFF" + [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  writeFileSync(csvPath, csvContent, "utf-8");
  console.log(`  CSV report saved to ${csvPath}`);
}

// ── Send HTML Email ─────────────────────────────────────────────────────────
async function sendEmailReport(dateStr: string, label: string, data: EmployeeReport[]): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, REPORT_EMAIL_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !REPORT_EMAIL_TO) {
    console.warn("  SMTP not configured, skipping email. Set SMTP_HOST, SMTP_USER, SMTP_PASS, REPORT_EMAIL_TO in .env");
    return;
  }

  const port = parseInt(SMTP_PORT || "587", 10);
  const transporter = createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  // Summary counts
  const present = data.filter(e => e.status === "Present" || e.status === "Late").length;
  const absent = data.filter(e => e.status === "Absent").length;
  const onLeave = data.filter(e => e.status === "Leave").length;
  const inProgress = data.filter(e => e.status === "In Progress").length;
  const halfDay = data.filter(e => e.status === "Half Day" || e.status === "Short Day").length;
  const overtime = data.filter(e => e.status === "Overtime").length;

  const statusColors: Record<string, string> = {
    "Present": "#168052", "Late": "#A86400", "Absent": "#C73333",
    "Half Day": "#A86400", "Short Day": "#C73333", "Leave": "#2563EB",
    "In Progress": "#6D45E5", "Sunday": "#667085", "Overtime": "#6D45E5",
    "Holiday": "#667085",
  };

  const tableRows = data.map(emp => {
    const color = statusColors[emp.status] || "#333";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${emp.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${emp.office}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${emp.punchIn ? formatTimeIST(emp.punchIn) : "-"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${emp.punchOut ? formatTimeIST(emp.punchOut) : "-"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${emp.durationMinutes ? formatDuration(emp.durationMinutes) : "-"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${emp.breakMinutes ? formatDuration(emp.breakMinutes) : "-"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${color};font-weight:600;">${emp.status}</td>
    </tr>`;
  }).join("\n");

  const timeLabel = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

  const summaryParts = [
    `Present: ${present}`,
    `Absent: ${absent}`,
    `Leave: ${onLeave}`,
    `Half/Short: ${halfDay}`,
  ];
  if (inProgress > 0) summaryParts.push(`In Progress: ${inProgress}`);
  if (overtime > 0) summaryParts.push(`Overtime: ${overtime}`);
  summaryParts.push(`Total: ${data.length}`);

  const html = `
<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
  <div style="background:#6D45E5;padding:16px 24px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;">Attendance Report &mdash; ${dateStr}</h2>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;">Generated at ${timeLabel} IST</p>
  </div>
  <div style="background:#f9fafb;padding:14px 24px;border-bottom:1px solid #eee;font-size:14px;">
    <strong>Summary:</strong> ${summaryParts.join(" &nbsp;|&nbsp; ")}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f8;">
        <th style="padding:8px 12px;text-align:left;">Employee</th>
        <th style="padding:8px 12px;text-align:left;">Office</th>
        <th style="padding:8px 12px;text-align:left;">Punch In</th>
        <th style="padding:8px 12px;text-align:left;">Punch Out</th>
        <th style="padding:8px 12px;text-align:left;">Duration</th>
        <th style="padding:8px 12px;text-align:left;">Break</th>
        <th style="padding:8px 12px;text-align:left;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <div style="padding:12px 24px;font-size:11px;color:#667085;">
    Database backup: ${label}.db &nbsp;|&nbsp; CSV: ${label}-report.csv
  </div>
</div>`;

  const csvPath = resolve(BACKUP_DIR, `${label}-report.csv`);

  await transporter.sendMail({
    from: SMTP_USER,
    to: REPORT_EMAIL_TO,
    subject: `Attendance Report - ${dateStr} (${timeLabel})`,
    html,
    attachments: [{ filename: `${label}-report.csv`, path: csvPath }],
  });

  console.log(`  Email sent to ${REPORT_EMAIL_TO}`);
}

// ── Cleanup Old Backups ─────────────────────────────────────────────────────
function cleanupOldBackups(): void {
  if (!existsSync(BACKUP_DIR)) return;

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = readdirSync(BACKUP_DIR);

  let removed = 0;
  for (const file of files) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})_/);
    if (!match) continue;
    const fileDate = new Date(match[1] + "T00:00:00").getTime();
    if (fileDate < cutoff) {
      unlinkSync(resolve(BACKUP_DIR, file));
      removed++;
    }
  }

  if (removed > 0) console.log(`  Cleaned up ${removed} old backup files.`);
}

// ── Run ─────────────────────────────────────────────────────────────────────
main().catch(err => {
  console.error("Backup script failed:", err);
  process.exit(1);
});
