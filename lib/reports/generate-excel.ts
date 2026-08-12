import type ExcelJS from "exceljs";

export type ReportDayDetail = {
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  durationMinutes: number | null;
  breakMinutes: number | null;
  status: string;
};

export type ReportEmployee = {
  id: string;
  name: string;
  shift: string;
  jobRole: string;
  office: string;
  monthlySalary: number;
  createdAt: string;
  presentDays: number;
  absentDays: number;
  lateAbsentDays: number;
  lateDays: number;
  leaveDays: number;
  uhDays: number;
  weeklyOffs: number;
  holidayCount: number;
  attendancePct: number;
  totalWorkedMinutes: number;
  perDayRate: number;
  deduction: number;
  netPay: number;
  dailyDetails: ReportDayDetail[];
};

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  leave: "Leave",
  uh: "Unpaid Holiday",
  sunday: "Sunday",
  holiday: "Holiday",
};

const statusColors: Record<string, { bg: string; fg: string }> = {
  present: { bg: "E8F7EF", fg: "168052" },
  late: { bg: "FFF4DC", fg: "A86400" },
  absent: { bg: "FFEDED", fg: "C73333" },
  leave: { bg: "EFF6FF", fg: "2563EB" },
  uh: { bg: "FFF4DC", fg: "A86400" },
  sunday: { bg: "F3F4F8", fg: "667085" },
  holiday: { bg: "F3F4F8", fg: "667085" },
};

function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtTimeIST(ts: string): string {
  const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") || ts.includes("+") ? "" : "Z"));
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function fmtDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short" });
}

function fmtJoinDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt(n: number): string {
  return `Rs ${n.toLocaleString("en-IN")}`;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: "thin", color: { argb: "FFE7E9EE" } };
  return { top: side, bottom: side, left: side, right: side };
}

function buildEmployeeSheet(
  sheet: ExcelJS.Worksheet,
  emp: ReportEmployee,
  month: string,
  workingDays: number,
) {
  // Column widths
  sheet.columns = [
    { width: 14 }, { width: 10 }, { width: 12 }, { width: 14 },
    { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 },
  ];

  // Row 1 — Title
  sheet.mergeCells("A1:H1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "ATTENDANCE & SALARY REPORT";
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D45E5" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 32;

  // Row 2 — Month
  sheet.mergeCells("A2:H2");
  const monthCell = sheet.getCell("A2");
  monthCell.value = `Month: ${month}`;
  monthCell.font = { size: 11, color: { argb: "FF667085" } };
  monthCell.alignment = { horizontal: "center" };

  // Row 3 — blank separator

  // Rows 4-11 — Employee info grid
  const infoRows: [string, string, string, string][] = [
    ["Employee Name", emp.name, "Monthly Salary", fmt(emp.monthlySalary)],
    ["Employee ID", emp.id, "Per Day Rate", fmt(emp.perDayRate)],
    ["Branch", emp.office, "Present Days", String(emp.presentDays)],
    ["Job Role", emp.jobRole, "Absent Days", String(emp.absentDays)],
    ["Shift Timing", emp.shift, "Late Days", `${emp.lateDays}${emp.lateAbsentDays > 0 ? ` (= ${emp.lateAbsentDays} absent)` : ""}`],
    ["Joining Date", fmtJoinDate(emp.createdAt), "Leave Days", String(emp.leaveDays)],
    ["Working Days", String(workingDays), "Weekly Offs", String(emp.weeklyOffs)],
    ["Deduction", fmt(emp.deduction), "Net Pay", fmt(emp.netPay)],
  ];

  for (let i = 0; i < infoRows.length; i++) {
    const row = sheet.getRow(4 + i);
    const [labelL, valL, labelR, valR] = infoRows[i];
    row.getCell(1).value = labelL;
    row.getCell(1).font = { bold: true, size: 10, color: { argb: "FF667085" } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    row.getCell(2).value = valL;
    row.getCell(2).font = { size: 10 };
    // Merge B-D for value column
    sheet.mergeCells(4 + i, 2, 4 + i, 4);

    row.getCell(5).value = labelR;
    row.getCell(5).font = { bold: true, size: 10, color: { argb: "FF667085" } };
    row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    row.getCell(6).value = valR;
    row.getCell(6).font = { size: 10, bold: labelR === "Net Pay" };
    if (labelR === "Net Pay") {
      row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F7EF" } };
    }
    sheet.mergeCells(4 + i, 6, 4 + i, 8);

    // Borders for info cells
    for (let c = 1; c <= 8; c++) {
      row.getCell(c).border = thinBorder();
    }
  }

  // Row 12 — blank separator
  const tableStartRow = 13;

  // Table header row
  const headers = ["Date", "Day", "Status", "Punch In", "Punch Out", "Break", "Work Hours", "Per Day Salary"];
  const headerRow = sheet.getRow(tableStartRow);
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: "FF667085" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    cell.alignment = { horizontal: "center" };
    cell.border = thinBorder();
  });
  headerRow.height = 22;

  // Daily rows
  let totalBreakMins = 0;
  let totalSalary = 0;
  let rowIdx = tableStartRow + 1;

  for (const day of emp.dailyDetails) {
    const row = sheet.getRow(rowIdx);
    const isWorkDay = day.status === "present" || day.status === "late";
    const daySalary = isWorkDay ? emp.perDayRate : 0;
    if (isWorkDay) totalSalary += daySalary;
    if (day.breakMinutes) totalBreakMins += day.breakMinutes;

    row.getCell(1).value = fmtDate(day.date);
    row.getCell(2).value = fmtDay(day.date);
    row.getCell(3).value = statusLabels[day.status] || day.status;
    row.getCell(4).value = day.punchIn ? fmtTimeIST(day.punchIn) : "\u2014";
    row.getCell(5).value = day.punchOut ? fmtTimeIST(day.punchOut) : "\u2014";
    row.getCell(6).value = day.breakMinutes ? fmtDur(day.breakMinutes) : "\u2014";
    row.getCell(7).value = day.durationMinutes ? fmtDur(day.durationMinutes) : "\u2014";
    row.getCell(8).value = isWorkDay ? fmt(daySalary) : "\u2014";

    // Status cell coloring
    const sc = statusColors[day.status];
    if (sc) {
      row.getCell(3).font = { size: 9, color: { argb: `FF${sc.fg}` }, bold: true };
      row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${sc.bg}` } };
    }

    // Style non-work day rows
    const isOff = day.status === "sunday" || day.status === "holiday";
    if (isOff) {
      for (let c = 1; c <= 8; c++) {
        row.getCell(c).font = { ...row.getCell(c).font, color: { argb: "FF667085" } };
      }
    }

    // Alignment + borders
    for (let c = 1; c <= 8; c++) {
      row.getCell(c).alignment = { horizontal: "center" };
      row.getCell(c).border = thinBorder();
    }

    rowIdx++;
  }

  // Totals row
  const totalsRow = sheet.getRow(rowIdx);
  totalsRow.getCell(1).value = "TOTAL";
  totalsRow.getCell(6).value = totalBreakMins > 0 ? fmtDur(totalBreakMins) : "\u2014";
  totalsRow.getCell(7).value = emp.totalWorkedMinutes > 0 ? fmtDur(emp.totalWorkedMinutes) : "\u2014";
  totalsRow.getCell(8).value = fmt(totalSalary);
  for (let c = 1; c <= 8; c++) {
    totalsRow.getCell(c).font = { bold: true, size: 10 };
    totalsRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    totalsRow.getCell(c).alignment = { horizontal: "center" };
    totalsRow.getCell(c).border = {
      top: { style: "double", color: { argb: "FF6D45E5" } },
      bottom: { style: "thin", color: { argb: "FFE7E9EE" } },
      left: { style: "thin", color: { argb: "FFE7E9EE" } },
      right: { style: "thin", color: { argb: "FFE7E9EE" } },
    };
  }

  // Generated on
  const genRow = sheet.getRow(rowIdx + 2);
  sheet.mergeCells(rowIdx + 2, 1, rowIdx + 2, 8);
  genRow.getCell(1).value = `Report Generated On: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
  genRow.getCell(1).font = { size: 9, italic: true, color: { argb: "FF667085" } };
  genRow.getCell(1).alignment = { horizontal: "right" };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function generateEmployeeExcel(
  emp: ReportEmployee,
  month: string,
  workingDays: number,
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(emp.name);
  buildEmployeeSheet(sheet, emp, month, workingDays);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `${emp.name.replace(/\s+/g, "-")}-report-${month}.xlsx`);
}

export async function generateAllEmployeesExcel(
  employees: ReportEmployee[],
  month: string,
  workingDays: number,
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  // Summary sheet
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { width: 24 }, { width: 14 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 },
  ];

  // Summary title
  summary.mergeCells("A1:I1");
  const sTitle = summary.getCell("A1");
  sTitle.value = `ATTENDANCE & SALARY REPORT \u2014 ${month}`;
  sTitle.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  sTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D45E5" } };
  sTitle.alignment = { horizontal: "center", vertical: "middle" };
  summary.getRow(1).height = 32;

  // Summary header
  const sHeaders = ["Employee", "ID", "Present", "Absent", "Late", "Leave", "Salary", "Deduction", "Net Pay"];
  const sHeaderRow = summary.getRow(3);
  sHeaders.forEach((h, idx) => {
    const cell = sHeaderRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: "FF667085" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    cell.border = thinBorder();
  });

  // Summary data rows
  let totSalary = 0, totDeduction = 0, totNet = 0;
  employees.forEach((emp, idx) => {
    const row = summary.getRow(4 + idx);
    row.getCell(1).value = emp.name;
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).value = emp.id;
    row.getCell(3).value = emp.presentDays;
    row.getCell(4).value = emp.absentDays;
    row.getCell(5).value = emp.lateDays;
    row.getCell(6).value = emp.leaveDays;
    row.getCell(7).value = fmt(emp.monthlySalary);
    row.getCell(8).value = emp.deduction > 0 ? `-${fmt(emp.deduction)}` : "\u2014";
    row.getCell(8).font = { color: { argb: "FFC73333" } };
    row.getCell(9).value = fmt(emp.netPay);
    row.getCell(9).font = { bold: true };
    for (let c = 1; c <= 9; c++) row.getCell(c).border = thinBorder();
    totSalary += emp.monthlySalary;
    totDeduction += emp.deduction;
    totNet += emp.netPay;
  });

  // Summary totals
  const sTotalRow = summary.getRow(4 + employees.length);
  sTotalRow.getCell(1).value = "TOTALS";
  sTotalRow.getCell(7).value = fmt(totSalary);
  sTotalRow.getCell(8).value = totDeduction > 0 ? `-${fmt(totDeduction)}` : "\u2014";
  sTotalRow.getCell(9).value = fmt(totNet);
  for (let c = 1; c <= 9; c++) {
    sTotalRow.getCell(c).font = { bold: true, size: 10 };
    sTotalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    sTotalRow.getCell(c).border = thinBorder();
  }

  // Per-employee sheets
  for (const emp of employees) {
    const sheetName = emp.name.slice(0, 31).replace(/[\\/*?[\]:]/g, "");
    const sheet = workbook.addWorksheet(sheetName);
    buildEmployeeSheet(sheet, emp, month, workingDays);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `attendance-report-${month}.xlsx`);
}
