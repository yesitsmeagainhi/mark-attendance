import { lt } from "drizzle-orm";
import { getDb } from "../db";
import { otpRequests } from "../db/schema";

const RETAIN_AFTER_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Delete OTPs (pending, used or expired) whose expiry passed more than an hour ago.
 * Compares on expires_at, which is always written as an ISO string by our code;
 * created_at uses SQLite's "YYYY-MM-DD HH:MM:SS" format and can't be compared to ISO strings.
 */
export function purgeOldOtps(): void {
  const cutoff = new Date(Date.now() - RETAIN_AFTER_EXPIRY_MS).toISOString();
  getDb().delete(otpRequests).where(lt(otpRequests.expiresAt, cutoff)).run();
}
