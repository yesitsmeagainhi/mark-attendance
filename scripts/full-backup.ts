// Weekly full backup: database + Excel export + photos, sent to email and Google Drive.
// Run from the project root: npm run backup:full   (schedule with cron, see DEPLOYMENT.md)
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { formatBytes, runFullBackup } from "../lib/backup";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

runFullBackup("scheduled")
  .then((s) => {
    console.log(`[${s.at}] Full backup ${s.ok ? "completed" : "FINISHED WITH ERRORS"}`);
    if (s.fileName) console.log(`  File:   ${s.fileName} (${formatBytes(s.sizeBytes || 0)}, ${s.photoCount} photos)`);
    console.log(`  Email:  ${s.email.status} - ${s.email.detail}`);
    console.log(`  Drive:  ${s.drive.status} - ${s.drive.detail}${s.drive.link ? ` ${s.drive.link}` : ""}`);
    if (s.error) console.error(`  Error:  ${s.error}`);
    process.exit(s.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("Full backup failed:", err);
    process.exit(1);
  });
