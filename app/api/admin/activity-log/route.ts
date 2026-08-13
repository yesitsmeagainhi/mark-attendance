import { sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { activityLog } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const actionType = url.searchParams.get("actionType") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const search = url.searchParams.get("search") || "";

  const db = getDb();
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof sql>[] = [];

  if (actionType) {
    const types = actionType.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length === 1) {
      conditions.push(sql`${activityLog.actionType} = ${types[0]}`);
    } else if (types.length > 1) {
      conditions.push(sql`${activityLog.actionType} IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`);
    }
  }

  if (from) {
    conditions.push(sql`${activityLog.timestamp} >= ${from}`);
  }
  if (to) {
    // Include the full "to" day
    conditions.push(sql`${activityLog.timestamp} < ${to + "T23:59:59.999Z"}`);
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      sql`(${activityLog.performedByName} LIKE ${pattern} OR ${activityLog.targetName} LIKE ${pattern} OR ${activityLog.description} LIKE ${pattern})`
    );
  }

  const whereClause = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const countResult = db.all<{ cnt: number }>(
    sql`SELECT COUNT(*) as cnt FROM activity_log ${whereClause}`
  );
  const total = countResult[0]?.cnt || 0;

  const activities = db.all<{
    id: string;
    action_type: string;
    performed_by: string;
    performed_by_name: string;
    target_id: string | null;
    target_name: string | null;
    description: string;
    metadata: string | null;
    timestamp: string;
  }>(
    sql`SELECT * FROM activity_log ${whereClause} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`
  );

  const mapped = activities.map((a) => ({
    id: a.id,
    actionType: a.action_type,
    performedBy: a.performed_by,
    performedByName: a.performed_by_name,
    targetId: a.target_id,
    targetName: a.target_name,
    description: a.description,
    metadata: a.metadata ? JSON.parse(a.metadata) : null,
    timestamp: a.timestamp,
  }));

  return Response.json({
    activities: mapped,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
