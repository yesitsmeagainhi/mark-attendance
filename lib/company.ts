import { inArray } from "drizzle-orm";
import { getDb } from "../db";
import { appSettings } from "../db/schema";

export type CompanyDetails = { name: string; address: string };

const KEYS = { name: "company_name", address: "company_address" } as const;

/** Company name and address shown on payslips (Settings → Company details). */
export function getCompanyDetails(): CompanyDetails {
  const rows = getDb().select().from(appSettings).where(inArray(appSettings.key, Object.values(KEYS))).all();
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  return { name: get(KEYS.name), address: get(KEYS.address) };
}

export function saveCompanyDetails(details: CompanyDetails) {
  const db = getDb();
  const now = new Date().toISOString();
  for (const [field, key] of Object.entries(KEYS) as [keyof CompanyDetails, string][]) {
    db.insert(appSettings)
      .values({ key, value: details[field], updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: details[field], updatedAt: now } })
      .run();
  }
}
