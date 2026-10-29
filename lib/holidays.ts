import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { employees, holidayEmployeeOverrides, holidays } from "../db/schema";

export type HolidayInfo = { id: string; date: string; name: string; paid: boolean };

/**
 * Load holidays in a date range plus their per-employee overrides.
 * `isPaidFor` resolves whether a given employee is paid for a holiday:
 * explicit per-holiday override > (holiday is paid AND employee is eligible).
 */
export function getHolidayCalendar(fromDate: string, toDate: string) {
  const db = getDb();
  const rows = db
    .select({ id: holidays.id, date: holidays.date, name: holidays.name, paid: holidays.paid })
    .from(holidays)
    .where(and(gte(holidays.date, fromDate), lte(holidays.date, toDate)))
    .all();

  const byDate = new Map<string, HolidayInfo>(rows.map((h) => [h.date, h]));

  const overrides = rows.length > 0
    ? db
      .select({ holidayId: holidayEmployeeOverrides.holidayId, employeeId: holidayEmployeeOverrides.employeeId, paid: holidayEmployeeOverrides.paid })
      .from(holidayEmployeeOverrides)
      .where(inArray(holidayEmployeeOverrides.holidayId, rows.map((h) => h.id)))
      .all()
    : [];
  const overrideMap = new Map(overrides.map((o) => [`${o.holidayId}:${o.employeeId}`, o.paid]));

  function isPaidFor(holiday: HolidayInfo, emp: { id: string; paidHolidays: boolean }): boolean {
    return overrideMap.get(`${holiday.id}:${emp.id}`) ?? (holiday.paid && emp.paidHolidays);
  }

  return { byDate, dates: new Set(byDate.keys()), isPaidFor };
}

/** Active non-admin employees, i.e. everyone payroll applies to. */
export function getPayrollEmployees() {
  return getDb()
    .select({ id: employees.id, name: employees.name, email: employees.email, paidHolidays: employees.paidHolidays, flexibleHours: employees.flexibleHours })
    .from(employees)
    .where(and(eq(employees.active, true), sql`${employees.role} != 'admin'`))
    .orderBy(employees.name)
    .all();
}

/**
 * Store only the exceptions: employees whose paid status differs from the
 * default (holiday paid AND employee eligible).
 */
export function saveHolidayOverrides(holidayId: string, paid: boolean, paidEmployeeIds: string[]) {
  const db = getDb();
  const paidSet = new Set(paidEmployeeIds);
  db.delete(holidayEmployeeOverrides).where(eq(holidayEmployeeOverrides.holidayId, holidayId)).run();
  for (const emp of getPayrollEmployees()) {
    // Hourly (flex) employees are paid by hours worked; holidays don't apply
    if (emp.flexibleHours) continue;
    const defaultPaid = paid && emp.paidHolidays;
    const wantPaid = paidSet.has(emp.id);
    if (wantPaid !== defaultPaid) {
      db.insert(holidayEmployeeOverrides)
        .values({ id: crypto.randomUUID(), holidayId, employeeId: emp.id, paid: wantPaid })
        .run();
    }
  }
}
