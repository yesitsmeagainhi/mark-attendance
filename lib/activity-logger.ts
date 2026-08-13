import { getDb } from "../db";
import { activityLog } from "../db/schema";

export function logActivity(params: {
  actionType: string;
  performedBy: string;
  performedByName: string;
  targetId?: string;
  targetName?: string;
  description: string;
  metadata?: Record<string, unknown>;
}): void {
  try {
    const db = getDb();
    db.insert(activityLog).values({
      id: crypto.randomUUID(),
      actionType: params.actionType,
      performedBy: params.performedBy,
      performedByName: params.performedByName,
      targetId: params.targetId || null,
      targetName: params.targetName || null,
      description: params.description,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      timestamp: new Date().toISOString(),
    }).run();
  } catch {
    // Never let logging failures break the main operation
  }
}
