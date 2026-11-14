import type { PayslipData } from "./payslips";
import type { SalaryLine } from "./pay-rules";
import { amountInWords } from "./amount-words";

export type PayslipRow = { label: string; note: string; amount: number };

/** Plain amount, e.g. 152300 → "1,52,300". */
export const amountText = (n: number) => Math.round(n).toLocaleString("en-IN");
/** Amount with rupee sign, e.g. "₹1,52,300". */
export const rupees = (n: number) => `₹${amountText(n)}`;

const hm = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;

/** Short "how it was worked out" text; older payslips only have the long detail. */
function noteFor(l: SalaryLine): string {
  if (l.note) return l.note;
  const arrow = l.detail.lastIndexOf("→");
  return (arrow >= 0 ? l.detail.slice(arrow + 1) : l.detail).trim();
}

/** Earnings, deductions, totals and net pay, shared by the screen and the PDF. */
export function payslipTable(slip: PayslipData) {
  let earnings: PayslipRow[];
  let deductions: PayslipRow[];
  if (slip.isFlexible) {
    earnings = [{ label: "Hourly pay", note: `${hm(slip.attendance.workedMinutes)} × ${rupees(slip.pay.hourlyRate)}/hour`, amount: slip.pay.netPay }];
    deductions = [];
  } else {
    earnings = slip.pay.lines
      .filter((l) => l.kind === "base" || l.kind === "extra")
      .map((l) => ({ label: l.label, note: l.kind === "base" ? "Fixed pay for the month" : noteFor(l), amount: l.amount }));
    deductions = slip.pay.lines
      .filter((l) => l.kind === "deduction")
      .map((l) => ({ label: l.label, note: noteFor(l), amount: -l.amount }));
  }
  const totalEarnings = earnings.reduce((s, r) => s + r.amount, 0);
  const totalDeductions = deductions.reduce((s, r) => s + r.amount, 0);
  return {
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    netPay: slip.pay.netPay,
    netPayWords: `${amountInWords(slip.pay.netPay)} Rupees Only`,
  };
}

/** Header details, left and right columns, as [label, value] pairs. */
export function payslipDetails(slip: PayslipData) {
  const fmtDate = (d?: string) => {
    if (!d) return "-";
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  };
  const worked = slip.attendance.workedDays ?? slip.attendance.presentDays;
  const left: [string, string][] = [
    ["Employee Name", slip.employee.name],
    ["Employee ID", slip.employee.id],
    ["Designation", slip.employee.jobRole || "-"],
    ["Department", slip.employee.department || "-"],
  ];
  const right: [string, string][] = [
    ["Pay Period", slip.monthLabel],
    slip.isFlexible ? ["Hours Worked", hm(slip.attendance.workedMinutes)] : ["Worked Days", `${worked} of ${slip.attendance.daysInMonth}`],
    ["Date of Joining", fmtDate(slip.employee.dateOfJoining)],
    ["Branch", slip.employee.office || "-"],
  ];
  return { left, right };
}
