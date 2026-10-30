import { requireApiRole } from "../../../authz";
import { getBackupConfig, getLastBackupStatus, runFullBackup } from "../../../../lib/backup";
import { logActivity } from "../../../../lib/activity-logger";

export async function GET() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  return Response.json({ config: getBackupConfig(), last: getLastBackupStatus() });
}

export async function POST() {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  try {
    const status = await runFullBackup("manual");
    logActivity({
      actionType: "backup_run",
      performedBy: auth.identity.employeeId,
      performedByName: auth.identity.displayName,
      description: `Admin ran a full backup (${status.ok ? "success" : "failed"}; email ${status.email.status}, Drive ${status.drive.status})`,
      metadata: { fileName: status.fileName, ok: status.ok },
    });
    return Response.json({ status }, { status: status.ok ? 200 : 500 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Backup failed." }, { status: 409 });
  }
}
