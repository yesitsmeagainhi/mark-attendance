/**
 * Monthly payslips.
 *
 * An admin publishes a finished month; each employee then sees a frozen copy
 * of their salary for it in their own panel. The figures come from the same
 * calculation as the admin Reports tab (lib/monthly-report.ts). Re-publishing
 * replaces the copies, e.g. after approving a late miss-punch.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { employees, payslips } from "../db/schema";
import { buildMonthlyReport } from "./monthly-report";
import type { SalaryLine } from "./pay-rules";
import { getCompanyDetails, type CompanyDetails } from "./company";

export type PayslipData = {
  month: string;
  monthLabel: string;
  /** Company name/address at publish time (older payslips fall back to the current settings) */
  company?: CompanyDetails;
  employee: { id: string; name: string; jobRole: string; department: string; office: string; shift: string; dateOfJoining?: string };
  isFlexible: boolean;
  attendance: {
    daysInMonth: number;
    /** Present days + half days (as ½) + week-offs worked */
    workedDays?: number;
    presentDays: number;
    halfDays: number;
    absentDays: number;
    lateDays: number;
    leaveDays: number;
    unpaidLeaveDays: number;
    weeklyOffs: number;
    holidays: number;
    weekOffWorkedDays: number;
    workedMinutes: number;
    overtimeMinutes: number;
  };
  pay: {
    monthlySalary: number;
    perDayRate: number;
    hourlyRate: number;
    /** Line-by-line breakdown (monthly-salary staff) */
    lines: SalaryLine[];
    deductions: number;
    additions: number;
    netPay: number;
  };
};

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "YYYY-MM" of the current month in India. */
export function currentMonthIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
}

export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/** Build (but don't save) the payslips for a month. Staff with no salary or hourly rate get none. */
export function buildPayslips(month: string): PayslipData[] {
  const report = buildMonthlyReport(month);
  const ids = report.employees.map((e) => e.id);
  const extraById = new Map(
    ids.length
      ? getDb().select({ id: employees.id, department: employees.department, companyName: employees.companyName }).from(employees).where(inArray(employees.id, ids)).all().map((e) => [e.id, e])
      : [],
  );
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const company = getCompanyDetails();

  const slips: PayslipData[] = [];
  for (const e of report.employees) {
    const flex = !!e.isFlexible;
    const hourlyRate = e.hourlyRate || 0;
    if (flex ? hourlyRate <= 0 : e.monthlySalary <= 0) continue;

    // Hourly staff: hours worked × hourly rate (as in Payroll)
    const flexPay = flex ? Math.round((e.totalWorkedMinutes / 60) * hourlyRate) : 0;
    const lines = flex ? [] : (e.salaryLines ?? []);
    const additions = flex ? 0 : (e.weekOffBonus || 0) + (e.overtimePay || 0);

    slips.push({
      month,
      monthLabel: monthLabel(month),
      // The employee's own company if set, otherwise the default from Settings
      company: { ...company, name: extraById.get(e.id)?.companyName || company.name },
      employee: { id: e.id, name: e.name, jobRole: e.jobRole || "Employee", department: extraById.get(e.id)?.department || "", office: e.office, shift: e.shift, dateOfJoining: (e.createdAt || "").slice(0, 10) },
      isFlexible: flex,
      attendance: {
        daysInMonth,
        workedDays: e.presentDays + e.halfDays * 0.5 + e.weekOffWorkedDays,
        presentDays: e.presentDays,
        halfDays: e.halfDays,
        absentDays: e.absentDays,
        lateDays: e.lateDays,
        leaveDays: e.leaveDays,
        unpaidLeaveDays: e.unpaidLeaveDays || 0,
        weeklyOffs: e.weeklyOffs,
        holidays: e.holidayCount,
        weekOffWorkedDays: e.weekOffWorkedDays,
        workedMinutes: e.totalWorkedMinutes,
        overtimeMinutes: e.overtimeMinutes || 0,
      },
      pay: {
        monthlySalary: flex ? 0 : e.monthlySalary,
        perDayRate: flex ? 0 : e.perDayRate,
        hourlyRate: flex ? hourlyRate : 0,
        lines,
        deductions: flex ? 0 : e.deduction,
        additions,
        netPay: flex ? flexPay : e.netPay,
      },
    });
  }
  return slips;
}

/** Publish (or re-publish) a month: replaces that month's payslips with fresh copies. */
export function publishPayslips(month: string, publishedBy: string): number {
  const slips = buildPayslips(month);
  const db = getDb();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(payslips).where(eq(payslips.month, month)).run();
    for (const s of slips) {
      tx.insert(payslips).values({
        id: crypto.randomUUID(),
        employeeId: s.employee.id,
        month,
        data: JSON.stringify(s),
        netPay: s.pay.netPay,
        publishedAt: now,
        publishedBy,
      }).run();
    }
  });
  return slips.length;
}

export function unpublishPayslips(month: string): number {
  return getDb().delete(payslips).where(eq(payslips.month, month)).run().changes;
}

export function payslipMonthStatus(month: string): { published: boolean; count: number; publishedAt: string | null } {
  const rows = getDb().select({ publishedAt: payslips.publishedAt }).from(payslips).where(eq(payslips.month, month)).all();
  return { published: rows.length > 0, count: rows.length, publishedAt: rows[0]?.publishedAt ?? null };
}

/** An employee's published payslips, newest first (summary only). */
export function listEmployeePayslips(employeeId: string) {
  return getDb()
    .select({ month: payslips.month, netPay: payslips.netPay, publishedAt: payslips.publishedAt })
    .from(payslips)
    .where(eq(payslips.employeeId, employeeId))
    .orderBy(desc(payslips.month))
    .all()
    .map((p) => ({ ...p, monthLabel: monthLabel(p.month) }));
}

export function getEmployeePayslip(employeeId: string, month: string): (PayslipData & { publishedAt: string }) | null {
  const row = getDb()
    .select({ data: payslips.data, publishedAt: payslips.publishedAt })
    .from(payslips)
    .where(and(eq(payslips.employeeId, employeeId), eq(payslips.month, month)))
    .get();
  if (!row) return null;
  const data = JSON.parse(row.data) as PayslipData;
  if (!data.company?.name) data.company = getCompanyDetails();
  if (!data.employee.dateOfJoining) {
    const emp = getDb().select({ createdAt: employees.createdAt }).from(employees).where(eq(employees.id, employeeId)).get();
    data.employee.dateOfJoining = (emp?.createdAt || "").slice(0, 10);
  }
  if (data.attendance.workedDays === undefined) {
    data.attendance.workedDays = data.attendance.presentDays + data.attendance.halfDays * 0.5 + data.attendance.weekOffWorkedDays;
  }
  return { ...data, publishedAt: row.publishedAt };
}
