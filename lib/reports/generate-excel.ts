import type ExcelJS from "exceljs";

export type ReportSessionInfo = {
  inTime: string;
  outTime: string | null;
  durationMinutes: number | null;
};

export type ReportDayDetail = {
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  durationMinutes: number | null;
  breakMinutes: number | null;
  status: string;
  sessions?: ReportSessionInfo[];
};

export type ReportEmployee = {
  id: string;
  name: string;
  shift: string;
  jobRole: string;
  office: string;
  monthlySalary: number;
  createdAt: string;
  isFlexible?: boolean;
  hourlyRate?: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  lateAbsentDays: number;
  lateDays: number;
  leaveDays: number;
  uhDays: number;
  weeklyOffs: number;
  holidayCount: number;
  attendancePct: number;
  totalWorkedMinutes: number;
  sundayWorkedDays: number;
  sundayBonus: number;
  perDayRate: number;
  deduction: number;
  netPay: number;
  dailyDetails: ReportDayDetail[];
};

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  "half-day": "Half Day",
  "short-day": "Short Day",
  leave: "Leave",
  uh: "Unpaid Holiday",
  sunday: "Sunday",
  "sunday-worked": "Sun Work",
  holiday: "Holiday",
};

const statusColors: Record<string, { bg: string; fg: string }> = {
  present: { bg: "E8F7EF", fg: "168052" },
  late: { bg: "FFF4DC", fg: "A86400" },
  absent: { bg: "FFEDED", fg: "C73333" },
  "half-day": { bg: "FFF4DC", fg: "A86400" },
  "short-day": { bg: "FFEDED", fg: "C73333" },
  leave: { bg: "EFF6FF", fg: "2563EB" },
  uh: { bg: "FFF4DC", fg: "A86400" },
  sunday: { bg: "F3F4F8", fg: "667085" },
  "sunday-worked": { bg: "DBEAFE", fg: "1D4ED8" },
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

function fmt(n: number): string {
  return `\u20B9${n.toLocaleString("en-IN")}`;
}

// --- Styling helpers ---

const PURPLE = "FF6D45E5";
const DARK = "FF172033";
const GRAY = "FF667085";
const LIGHT_GRAY = "FFF9FAFB";
const STRIPE = "FFFBFBFE";
const WHITE = "FFFFFFFF";
const GREEN_BG = "FFE8F7EF";
const GREEN_FG = "FF168052";
const RED_FG = "FFC73333";

function borderAll(color = "FFE0E2E9"): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: "thin", color: { argb: color } };
  return { top: s, bottom: s, left: s, right: s };
}

/** Render one employee block starting at `startRow`. Returns the next available row. */
function buildEmployeeBlock(
  sheet: ExcelJS.Worksheet,
  emp: ReportEmployee,
  month: string,
  workingDays: number,
  startRow: number,
): number {
  const colCount = 6;
  let r = startRow;

  // ── Title bar ──
  sheet.mergeCells(r, 1, r, colCount);
  const titleCell = sheet.getCell(r, 1);
  titleCell.value = `ATTENDANCE & SALARY REPORT`;
  titleCell.font = { bold: true, size: 13, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(r).height = 28;
  r++;

  // ── Month subtitle ──
  sheet.mergeCells(r, 1, r, colCount);
  const subCell = sheet.getCell(r, 1);
  subCell.value = month;
  subCell.font = { bold: true, size: 10, color: { argb: GRAY } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
  for (let c = 1; c <= colCount; c++) sheet.getRow(r).getCell(c).border = borderAll();
  sheet.getRow(r).height = 20;
  r++;

  // ── Blank spacer ──
  sheet.getRow(r).height = 6;
  r++;

  // ── Employee info grid ──
  const infoGrid: [string, string, string, string, string, string][] = [
    ["Name", emp.name, "Emp ID", emp.id, "Branch", emp.office],
    ["Role", emp.jobRole || "Employee", "Shift", emp.shift, "Work Days", String(workingDays)],
    ["Present", String(emp.presentDays), "Half Day", String(emp.halfDays || 0), "Absent", String(emp.absentDays)],
    ["Late", `${emp.lateDays}${emp.lateAbsentDays > 0 ? ` (=${emp.lateAbsentDays}d ded.)` : ""}`, "Leave", String(emp.leaveDays), "Sun Work", `${emp.sundayWorkedDays}${emp.sundayBonus > 0 ? ` (+${fmt(emp.sundayBonus)})` : ""}`],
    ["Salary", fmt(emp.monthlySalary), "Deduction", emp.deduction > 0 ? `-${fmt(emp.deduction)}` : "\u2014", "Net Pay", fmt(emp.netPay)],
  ];

  for (let i = 0; i < infoGrid.length; i++) {
    const row = sheet.getRow(r);
    row.height = 18;
    const data = infoGrid[i];
    for (let p = 0; p < 3; p++) {
      const labelCol = p * 2 + 1;
      const valCol = p * 2 + 2;
      const label = data[p * 2];
      const val = data[p * 2 + 1];

      row.getCell(labelCol).value = label;
      row.getCell(labelCol).font = { bold: true, size: 9, color: { argb: GRAY } };
      row.getCell(labelCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
      row.getCell(labelCol).alignment = { vertical: "middle" };

      row.getCell(valCol).value = val;
      row.getCell(valCol).font = { size: 9, color: { argb: DARK } };
      row.getCell(valCol).alignment = { vertical: "middle" };

      if (label === "Name") row.getCell(valCol).font = { bold: true, size: 10, color: { argb: DARK } };
      if (label === "Net Pay") {
        row.getCell(valCol).font = { bold: true, size: 10, color: { argb: GREEN_FG } };
        row.getCell(valCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };
      }
      if (label === "Deduction" && emp.deduction > 0) row.getCell(valCol).font = { bold: true, size: 9, color: { argb: RED_FG } };
      if (label === "Present") row.getCell(valCol).font = { bold: true, size: 9, color: { argb: GREEN_FG } };
      if (label === "Absent") row.getCell(valCol).font = { bold: true, size: 9, color: { argb: RED_FG } };
    }
    for (let c = 1; c <= colCount; c++) row.getCell(c).border = borderAll();
    r++;
  }

  // ── Blank spacer ──
  sheet.getRow(r).height = 6;
  r++;

  // ── Table header ──
  const headers = ["Date", "Punch In", "Punch Out", "Break", "Work Hours", "Status"];
  const headerRow = sheet.getRow(r);
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderAll();
  });
  headerRow.height = 22;
  r++;

  // ── Daily rows ──
  let totalBreakMins = 0;
  for (let di = 0; di < emp.dailyDetails.length; di++) {
    const day = emp.dailyDetails[di];
    const row = sheet.getRow(r);
    row.height = 16;
    if (day.breakMinutes) totalBreakMins += day.breakMinutes;

    const isEvenRow = di % 2 === 1;
    const isOff = day.status === "sunday" || day.status === "holiday";
    const rowBg = isOff ? "FFF3F4F8" : (isEvenRow ? STRIPE : WHITE);

    row.getCell(1).value = `${fmtDay(day.date)}, ${fmtDate(day.date)}`;
    row.getCell(1).font = { bold: true, size: 9, color: { argb: isOff ? GRAY : DARK } };
    row.getCell(2).value = day.punchIn ? fmtTimeIST(day.punchIn) : "\u2014";
    row.getCell(3).value = day.punchOut ? fmtTimeIST(day.punchOut) : "\u2014";
    row.getCell(4).value = day.breakMinutes ? fmtDur(day.breakMinutes) : "\u2014";
    row.getCell(5).value = day.durationMinutes ? fmtDur(day.durationMinutes) : "\u2014";
    if (day.durationMinutes) row.getCell(5).font = { bold: true, size: 9, color: { argb: PURPLE } };

    row.getCell(6).value = statusLabels[day.status] || day.status;
    const sc = statusColors[day.status];
    if (sc) {
      row.getCell(6).font = { bold: true, size: 9, color: { argb: `FF${sc.fg}` } };
      row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${sc.bg}` } };
    }

    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(c).border = borderAll();
      const existingFill = row.getCell(c).fill;
      if (c !== 6 && !(existingFill && "fgColor" in existingFill && existingFill.fgColor)) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
      }
      if (!row.getCell(c).font?.size) row.getCell(c).font = { size: 9, color: { argb: isOff ? GRAY : DARK } };
    }
    r++;
  }

  // ── Totals row ──
  const totalsRow = sheet.getRow(r);
  totalsRow.height = 22;
  totalsRow.getCell(1).value = "TOTAL";
  totalsRow.getCell(4).value = totalBreakMins > 0 ? fmtDur(totalBreakMins) : "\u2014";
  totalsRow.getCell(5).value = emp.totalWorkedMinutes > 0 ? fmtDur(emp.totalWorkedMinutes) : "\u2014";
  totalsRow.getCell(6).value = `${emp.attendancePct}%`;
  for (let c = 1; c <= colCount; c++) {
    totalsRow.getCell(c).font = { bold: true, size: 10, color: { argb: PURPLE } };
    totalsRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEE9FF" } };
    totalsRow.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
    totalsRow.getCell(c).border = {
      top: { style: "medium", color: { argb: PURPLE } },
      bottom: { style: "medium", color: { argb: PURPLE } },
      left: { style: "thin", color: { argb: "FFE0E2E9" } },
      right: { style: "thin", color: { argb: "FFE0E2E9" } },
    };
  }
  r++;

  // ── Generated timestamp ──
  sheet.mergeCells(r, 1, r, colCount);
  const genRow = sheet.getRow(r);
  genRow.getCell(1).value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
  genRow.getCell(1).font = { size: 8, italic: true, color: { argb: GRAY } };
  genRow.getCell(1).alignment = { horizontal: "right" };
  genRow.height = 16;
  r++;

  return r;
}

function buildEmployeeSheet(
  sheet: ExcelJS.Worksheet,
  emp: ReportEmployee,
  month: string,
  workingDays: number,
) {
  sheet.columns = [
    { width: 18 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 },
  ];

  const endRow = buildEmployeeBlock(sheet, emp, month, workingDays, 1);

  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.25, right: 0.25, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
  };
  sheet.pageSetup.printArea = `A1:F${endRow - 1}`;
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

/** Flat report — all employees stacked in one sheet with daily breakdowns (styled CSV replacement) */
export async function generateFlatReportExcel(
  employees: ReportEmployee[],
  month: string,
  workingDays: number,
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");

  sheet.columns = [
    { width: 18 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 },
  ];

  let currentRow = 1;
  for (let i = 0; i < employees.length; i++) {
    if (i > 0) {
      // 2 blank rows between employees
      sheet.getRow(currentRow).height = 10;
      currentRow++;
      sheet.getRow(currentRow).height = 10;
      currentRow++;
    }
    currentRow = buildEmployeeBlock(sheet, employees[i], month, workingDays, currentRow);
  }

  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `attendance-excel2-${month}.xlsx`);
}

export async function generateAllEmployeesExcel(
  employees: ReportEmployee[],
  month: string,
  workingDays: number,
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  // ── Summary sheet ──
  const summary = workbook.addWorksheet("Summary");
  const sCols = 10;
  summary.columns = [
    { width: 26 }, { width: 14 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 },
  ];

  // Title bar
  summary.mergeCells("A1:J1");
  const sTitle = summary.getCell("A1");
  sTitle.value = `ATTENDANCE & SALARY REPORT \u2014 ${month}`;
  sTitle.font = { bold: true, size: 14, color: { argb: WHITE } };
  sTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  sTitle.alignment = { horizontal: "center", vertical: "middle" };
  summary.getRow(1).height = 34;

  // Subtitle
  summary.mergeCells("A2:J2");
  const sSub = summary.getCell("A2");
  sSub.value = `${employees.length} Employees  \u00B7  ${workingDays} Working Days`;
  sSub.font = { size: 10, color: { argb: GRAY } };
  sSub.alignment = { horizontal: "center", vertical: "middle" };
  sSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
  for (let c = 1; c <= sCols; c++) summary.getRow(2).getCell(c).border = borderAll();
  summary.getRow(2).height = 22;

  // Spacer
  summary.getRow(3).height = 6;

  // Header row
  const sHeaders = ["Employee", "ID", "Present", "Half Day", "Absent", "Late", "Leave", "Salary", "Deduction", "Net Pay"];
  const sHeaderRow = summary.getRow(4);
  sHeaderRow.height = 22;
  sHeaders.forEach((h, idx) => {
    const cell = sHeaderRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderAll();
  });

  // Data rows
  let totSalary = 0, totDeduction = 0, totNet = 0;
  employees.forEach((emp, idx) => {
    const row = summary.getRow(5 + idx);
    row.height = 20;
    const isEven = idx % 2 === 1;
    const rowBg = isEven ? STRIPE : WHITE;

    row.getCell(1).value = emp.name;
    row.getCell(1).font = { bold: true, size: 10, color: { argb: DARK } };
    row.getCell(1).alignment = { vertical: "middle" };

    row.getCell(2).value = emp.id;
    row.getCell(3).value = emp.presentDays;
    row.getCell(3).font = { bold: true, size: 9, color: { argb: GREEN_FG } };
    row.getCell(4).value = emp.halfDays || 0;
    row.getCell(5).value = emp.absentDays;
    row.getCell(5).font = { size: 9, color: { argb: emp.absentDays > 0 ? RED_FG : GRAY } };
    row.getCell(6).value = emp.lateDays;
    row.getCell(7).value = emp.leaveDays;
    row.getCell(8).value = fmt(emp.monthlySalary);
    row.getCell(9).value = emp.deduction > 0 ? `-${fmt(emp.deduction)}` : "\u2014";
    if (emp.deduction > 0) row.getCell(9).font = { size: 9, color: { argb: RED_FG } };
    row.getCell(10).value = fmt(emp.netPay);
    row.getCell(10).font = { bold: true, size: 9, color: { argb: GREEN_FG } };

    for (let c = 1; c <= sCols; c++) {
      row.getCell(c).border = borderAll();
      row.getCell(c).alignment = { ...row.getCell(c).alignment, horizontal: c === 1 ? "left" : "center", vertical: "middle" };
      if (!row.getCell(c).font?.size) row.getCell(c).font = { size: 9, color: { argb: DARK } };
      const eFill = row.getCell(c).fill;
      if (!(eFill && "fgColor" in eFill && eFill.fgColor)) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
    }

    totSalary += emp.monthlySalary;
    totDeduction += emp.deduction;
    totNet += emp.netPay;
  });

  // Totals row
  const sTotalRow = summary.getRow(5 + employees.length);
  sTotalRow.height = 24;
  sTotalRow.getCell(1).value = "TOTALS";
  sTotalRow.getCell(8).value = fmt(totSalary);
  sTotalRow.getCell(9).value = totDeduction > 0 ? `-${fmt(totDeduction)}` : "\u2014";
  sTotalRow.getCell(10).value = fmt(totNet);
  for (let c = 1; c <= sCols; c++) {
    sTotalRow.getCell(c).font = { bold: true, size: 10, color: { argb: PURPLE } };
    sTotalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEE9FF" } };
    sTotalRow.getCell(c).alignment = { horizontal: c === 1 ? "left" : "center", vertical: "middle" };
    sTotalRow.getCell(c).border = {
      top: { style: "medium", color: { argb: PURPLE } },
      bottom: { style: "medium", color: { argb: PURPLE } },
      left: { style: "thin", color: { argb: "FFE0E2E9" } },
      right: { style: "thin", color: { argb: "FFE0E2E9" } },
    };
  }

  // Per-employee sheets
  for (const emp of employees) {
    const sheetName = emp.name.slice(0, 31).replace(/[\\/*?[\]:]/g, "");
    const sheet = workbook.addWorksheet(sheetName);
    buildEmployeeSheet(sheet, emp, month, workingDays);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `attendance-excel3-${month}.xlsx`);
}

/** Date-wise report — grouped by date, each date lists all employees' attendance */
export async function generateRawReportExcel(
  employees: ReportEmployee[],
  month: string,
  workingDays: number,
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Attendance");

  const colCount = 5;
  sheet.columns = [
    { width: 24 }, // Employee Name
    { width: 14 }, // Punch In
    { width: 14 }, // Punch Out
    { width: 14 }, // Duration
    { width: 16 }, // Status
  ];

  // ── Row 1: Title bar ──
  sheet.mergeCells("A1:E1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `ATTENDANCE REPORT \u2014 ${month}`;
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 34;

  // ── Row 2: Subtitle ──
  sheet.mergeCells("A2:E2");
  const subCell = sheet.getCell("A2");
  subCell.value = `${employees.length} Employees  \u00B7  ${workingDays} Working Days`;
  subCell.font = { size: 10, color: { argb: GRAY } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
  for (let c = 1; c <= colCount; c++) sheet.getRow(2).getCell(c).border = borderAll();
  sheet.getRow(2).height = 22;

  // ── Row 3: Spacer ──
  sheet.getRow(3).height = 6;

  // ── Build date-indexed map: date → [{empName, day}] ──
  const dateMap = new Map<string, { empName: string; day: ReportDayDetail }[]>();
  for (const emp of employees) {
    for (const day of emp.dailyDetails) {
      if (!dateMap.has(day.date)) dateMap.set(day.date, []);
      dateMap.get(day.date)!.push({ empName: emp.name, day });
    }
  }
  // Sort dates chronologically
  const sortedDates = [...dateMap.keys()].sort();

  // ── Data rows grouped by date ──
  let r = 4;
  for (const dateStr of sortedDates) {
    const entries = dateMap.get(dateStr)!;
    const dayOfWeek = new Date(dateStr + "T00:00:00");
    const isOff = dayOfWeek.getDay() === 0 || entries[0]?.day.status === "holiday";

    // Date header row
    sheet.mergeCells(r, 1, r, colCount);
    const dateHeaderRow = sheet.getRow(r);
    dateHeaderRow.height = 22;
    const dateCell = dateHeaderRow.getCell(1);
    dateCell.value = `${fmtDay(dateStr)}, ${fmtDate(dateStr)}`;
    dateCell.font = { bold: true, size: 10, color: { argb: isOff ? GRAY : WHITE } };
    dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isOff ? "FFE8E9ED" : PURPLE } };
    dateCell.alignment = { horizontal: "left", vertical: "middle" };
    for (let c = 1; c <= colCount; c++) dateHeaderRow.getCell(c).border = borderAll();
    r++;

    // Column sub-header
    const subHeaders = ["Employee", "Punch In", "Punch Out", "Duration", "Status"];
    const subRow = sheet.getRow(r);
    subRow.height = 18;
    subHeaders.forEach((h, idx) => {
      const cell = subRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true, size: 8, color: { argb: GRAY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderAll();
    });
    r++;

    // Employee rows for this date
    for (let ei = 0; ei < entries.length; ei++) {
      const { empName, day } = entries[ei];
      const row = sheet.getRow(r);
      row.height = 16;
      const isEven = ei % 2 === 1;
      const rowBg = isOff ? "FFF3F4F8" : (isEven ? STRIPE : WHITE);

      row.getCell(1).value = empName;
      row.getCell(1).font = { bold: true, size: 9, color: { argb: DARK } };
      row.getCell(1).alignment = { vertical: "middle" };

      row.getCell(2).value = day.punchIn ? fmtTimeIST(day.punchIn) : "\u2014";
      row.getCell(3).value = day.punchOut ? fmtTimeIST(day.punchOut) : "\u2014";

      row.getCell(4).value = day.durationMinutes ? fmtDur(day.durationMinutes) : "\u2014";
      if (day.durationMinutes) row.getCell(4).font = { bold: true, size: 9, color: { argb: PURPLE } };

      row.getCell(5).value = statusLabels[day.status] || day.status;
      const sc = statusColors[day.status];
      if (sc) {
        row.getCell(5).font = { bold: true, size: 9, color: { argb: `FF${sc.fg}` } };
        row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${sc.bg}` } };
      }

      for (let c = 1; c <= colCount; c++) {
        row.getCell(c).alignment = { ...row.getCell(c).alignment, horizontal: c === 1 ? "left" : "center", vertical: "middle" };
        row.getCell(c).border = borderAll();
        const ef = row.getCell(c).fill;
        if (c !== 5 && !(ef && "fgColor" in ef && ef.fgColor)) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        }
        if (!row.getCell(c).font?.size) row.getCell(c).font = { size: 9, color: { argb: isOff ? GRAY : DARK } };
      }

      r++;
    }

    // Small gap after each date group
    sheet.getRow(r).height = 4;
    r++;
  }

  // ── Generated timestamp ──
  sheet.mergeCells(r, 1, r, colCount);
  const genRow = sheet.getRow(r);
  genRow.getCell(1).value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
  genRow.getCell(1).font = { size: 8, italic: true, color: { argb: GRAY } };
  genRow.getCell(1).alignment = { horizontal: "right" };
  genRow.height = 16;

  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
  };

  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `attendance-excel1-${month}.xlsx`);
}

/** Flex employee report — session-based attendance per employee */
export async function generateFlexReportExcel(
  employees: ReportEmployee[],
  month: string,
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  // const sheet = workbook.addWorksheet("Flex Attendance");

  const flexEmps = employees.filter((e) => e.isFlexible);
  if (flexEmps.length === 0) return;

  const colCount = 6;
  // sheet.columns = [
  //   { width: 18 }, // Date
  //   { width: 10 }, // Session
  //   { width: 14 }, // In Time
  //   { width: 14 }, // Out Time
  //   { width: 14 }, // Duration
  //   { width: 14 }, // Status
  // ];

  let r = 1;

  // // ── Title bar ──
  // sheet.mergeCells(r, 1, r, colCount);
  // const titleCell = sheet.getCell(r, 1);
  // titleCell.value = `FLEX ATTENDANCE REPORT \u2014 ${month}`;
  // titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  // titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  // titleCell.alignment = { horizontal: "center", vertical: "middle" };
  // sheet.getRow(r).height = 34;
  // r++;

  // // ── Subtitle ──
  // sheet.mergeCells(r, 1, r, colCount);
  // const subCell = sheet.getCell(r, 1);
  // subCell.value = `${flexEmps.length} Flex Employee${flexEmps.length > 1 ? "s" : ""}`;
  // subCell.font = { size: 10, color: { argb: GRAY } };
  // subCell.alignment = { horizontal: "center", vertical: "middle" };
  // subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
  // for (let c = 1; c <= colCount; c++) sheet.getRow(r).getCell(c).border = borderAll();
  // sheet.getRow(r).height = 22;
  // r++;

  // // ── Spacer ──
  // sheet.getRow(r).height = 6;
  // r++;

  // for (let ei = 0; ei < flexEmps.length; ei++) {
  //   const emp = flexEmps[ei];
  //   if (ei > 0) {
  //     sheet.getRow(r).height = 10;
  //     r++;
  //     sheet.getRow(r).height = 10;
  //     r++;
  //   }

  //   // ── Employee header bar ──
  //   sheet.mergeCells(r, 1, r, colCount);
  //   const empCell = sheet.getCell(r, 1);
  //   empCell.value = emp.name;
  //   empCell.font = { bold: true, size: 12, color: { argb: WHITE } };
  //   empCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  //   empCell.alignment = { horizontal: "left", vertical: "middle" };
  //   sheet.getRow(r).height = 26;
  //   r++;

  //   // ── Employee info row ──
  //   const infoRow = sheet.getRow(r);
  //   infoRow.height = 20;
  //   sheet.mergeCells(r, 1, r, 3);
  //   infoRow.getCell(1).value = `ID: ${emp.id}  \u00B7  ${emp.jobRole || "Employee"}  \u00B7  ${emp.office}`;
  //   infoRow.getCell(1).font = { size: 9, color: { argb: GRAY } };
  //   infoRow.getCell(1).alignment = { vertical: "middle" };
  //   sheet.mergeCells(r, 4, r, colCount);
  //   infoRow.getCell(4).value = `Rate: ${fmt(emp.hourlyRate || 0)}/hr`;
  //   infoRow.getCell(4).font = { bold: true, size: 9, color: { argb: PURPLE } };
  //   infoRow.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
  //   for (let c = 1; c <= colCount; c++) {
  //     infoRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
  //     infoRow.getCell(c).border = borderAll();
  //   }
  //   r++;

  //   // ── Spacer ──
  //   sheet.getRow(r).height = 4;
  //   r++;

  //   // ── Table header ──
  //   const headers = ["Date", "Sessions", "First IN", "Last OUT", "Total Worked", "Status"];
  //   const headerRow = sheet.getRow(r);
  //   headers.forEach((h, idx) => {
  //     const cell = headerRow.getCell(idx + 1);
  //     cell.value = h;
  //     cell.font = { bold: true, size: 9, color: { argb: WHITE } };
  //     cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  //     cell.alignment = { horizontal: "center", vertical: "middle" };
  //     cell.border = borderAll();
  //   });
  //   headerRow.height = 22;
  //   r++;

  //   // ── Daily rows (one row per day) ──
  //   let empTotalMinutes = 0;

  //   for (let di = 0; di < emp.dailyDetails.length; di++) {
  //     const day = emp.dailyDetails[di];
  //     const sessions = day.sessions || [];
  //     const isOff = day.status === "sunday" || day.status === "holiday";
  //     const noSessions = !day.punchIn || !day.punchOut || !day.durationMinutes;
  //     const isEvenRow = di % 2 === 1;

  //     const row = sheet.getRow(r);
  //     row.height = 16;
  //     const rowBg = isOff ? "FFF3F4F8" : (isEvenRow ? STRIPE : WHITE);

  //     // Col 1: Date
  //     row.getCell(1).value = `${fmtDay(day.date)}, ${fmtDate(day.date)}`;
  //     row.getCell(1).font = { bold: true, size: 9, color: { argb: isOff ? GRAY : DARK } };

  //     if (noSessions) {
  //       row.getCell(2).value = "\u2014";
  //       row.getCell(3).value = "\u2014";
  //       row.getCell(4).value = "\u2014";
  //       row.getCell(5).value = "\u2014";
  //     } else {
  //       // Col 2: Sessions count (only completed sessions with outTime)
  //       const completedSessions = sessions.filter(s => s.outTime !== null).length;
  //       row.getCell(2).value = completedSessions;
  //       row.getCell(2).font = { bold: true, size: 9, color: { argb: PURPLE } };

  //       // Col 3: First IN (use API-computed earliest punchIn)
  //       row.getCell(3).value = fmtTimeIST(day.punchIn!);

  //       // Col 4: Last OUT (use API-computed latest punchOut)
  //       row.getCell(4).value = fmtTimeIST(day.punchOut!);

  //       // Col 5: Total Worked (use API-computed durationMinutes)
  //       const dayTotal = day.durationMinutes!;
  //       empTotalMinutes += dayTotal;
  //       row.getCell(5).value = fmtDur(dayTotal);
  //       row.getCell(5).font = { bold: true, size: 9, color: { argb: PURPLE } };
  //     }

  //     // Col 6: Status
  //     row.getCell(6).value = statusLabels[day.status] || day.status;
  //     const sc = statusColors[day.status];
  //     if (sc) {
  //       row.getCell(6).font = { bold: true, size: 9, color: { argb: `FF${sc.fg}` } };
  //       row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${sc.bg}` } };
  //     }

  //     for (let c = 1; c <= colCount; c++) {
  //       row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
  //       row.getCell(c).border = borderAll();
  //       const ef = row.getCell(c).fill;
  //       if (c !== 6 && !(ef && "fgColor" in ef && ef.fgColor)) {
  //         row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
  //       }
  //       if (!row.getCell(c).font?.size) row.getCell(c).font = { size: 9, color: { argb: isOff ? GRAY : DARK } };
  //     }
  //     row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  //     r++;
  //   }

  //   // ── Employee totals row ──
  //   const totalHours = Math.round((empTotalMinutes / 60) * 100) / 100;
  //   const netPay = Math.round(totalHours * (emp.hourlyRate || 0));
  //   const totRow = sheet.getRow(r);
  //   totRow.height = 24;
  //   totRow.getCell(1).value = "TOTAL";
  //   totRow.getCell(2).value = "";
  //   totRow.getCell(3).value = "";
  //   totRow.getCell(4).value = `${totalHours}h`;
  //   totRow.getCell(4).font = { bold: true, size: 10, color: { argb: PURPLE } };
  //   totRow.getCell(5).value = empTotalMinutes > 0 ? fmtDur(empTotalMinutes) : "\u2014";
  //   totRow.getCell(5).font = { bold: true, size: 10, color: { argb: PURPLE } };
  //   totRow.getCell(6).value = `Net: ${fmt(netPay)}`;
  //   totRow.getCell(6).font = { bold: true, size: 10, color: { argb: GREEN_FG } };
  //   totRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };

  //   for (let c = 1; c <= colCount; c++) {
  //     if (!totRow.getCell(c).font?.size) totRow.getCell(c).font = { bold: true, size: 10, color: { argb: PURPLE } };
  //     if (!(totRow.getCell(c).fill && "fgColor" in totRow.getCell(c).fill && (totRow.getCell(c).fill as ExcelJS.FillPattern).fgColor)) {
  //       totRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEE9FF" } };
  //     }
  //     totRow.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
  //     totRow.getCell(c).border = {
  //       top: { style: "medium", color: { argb: PURPLE } },
  //       bottom: { style: "medium", color: { argb: PURPLE } },
  //       left: { style: "thin", color: { argb: "FFE0E2E9" } },
  //       right: { style: "thin", color: { argb: "FFE0E2E9" } },
  //     };
  //   }
  //   r++;
  // }

  // // ── Generated timestamp ──
  // sheet.getRow(r).height = 6;
  // r++;
  // sheet.mergeCells(r, 1, r, colCount);
  // const genRow = sheet.getRow(r);
  // genRow.getCell(1).value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
  // genRow.getCell(1).font = { size: 8, italic: true, color: { argb: GRAY } };
  // genRow.getCell(1).alignment = { horizontal: "right" };
  // genRow.height = 16;

  // sheet.pageSetup = {
  //   orientation: "landscape",
  //   paperSize: 9,
  //   fitToPage: true,
  //   fitToWidth: 1,
  //   fitToHeight: 0,
  //   margins: { left: 0.25, right: 0.25, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
  // };

  // ══════════════════════════════════════════════════════════════
  // Sheet 2 — Multi-employee detailed punches (grouped by date)
  // ══════════════════════════════════════════════════════════════
  const punchSheet = workbook.addWorksheet("Detailed Punches");
  const pCols = 6;
  punchSheet.columns = [
    { width: 24 }, // Employee
    { width: 10 }, // Session
    { width: 14 }, // IN
    { width: 14 }, // OUT
    { width: 14 }, // Duration
    { width: 14 }, // Status
  ];

  let pr = 1;

  // ── Title bar ──
  punchSheet.mergeCells(pr, 1, pr, pCols);
  const pTitle = punchSheet.getCell(pr, 1);
  pTitle.value = `FLEXIBLE Employees In-DETAIL PUNCHES \u2014 ${month}`;
  pTitle.font = { bold: true, size: 14, color: { argb: WHITE } };
  pTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  pTitle.alignment = { horizontal: "center", vertical: "middle" };
  punchSheet.getRow(pr).height = 34;
  pr++;

  // ── Subtitle ──
  punchSheet.mergeCells(pr, 1, pr, pCols);
  const pSub = punchSheet.getCell(pr, 1);
  pSub.value = `${flexEmps.length} Flex Employee${flexEmps.length > 1 ? "s" : ""}`;
  pSub.font = { size: 10, color: { argb: GRAY } };
  pSub.alignment = { horizontal: "center", vertical: "middle" };
  pSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
  for (let c = 1; c <= pCols; c++) punchSheet.getRow(pr).getCell(c).border = borderAll();
  punchSheet.getRow(pr).height = 22;
  pr++;

  // ── Spacer ──
  punchSheet.getRow(pr).height = 6;
  pr++;

  // ── Build date-indexed data ──
  const pDateMap = new Map<string, { empName: string; day: ReportDayDetail }[]>();
  for (const emp2 of flexEmps) {
    for (const day of emp2.dailyDetails) {
      if (!pDateMap.has(day.date)) pDateMap.set(day.date, []);
      pDateMap.get(day.date)!.push({ empName: emp2.name, day });
    }
  }
  const pSortedDates = [...pDateMap.keys()].sort();

  const P_STRIPE = "FFF0EDFF";
  const P_OFF_BG = "FFE5E7EB";

  for (const dateStr of pSortedDates) {
    const entries = pDateMap.get(dateStr)!;
    const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();
    const isOff = dayOfWeek === 0 || entries[0]?.day.status === "holiday";

    // ── Date group header row ──
    punchSheet.mergeCells(pr, 1, pr, pCols);
    const dateRow = punchSheet.getRow(pr);
    dateRow.height = 22;
    dateRow.getCell(1).value = `DATE: ${fmtDay(dateStr).toUpperCase()}, ${fmtDate(dateStr).toUpperCase()}`;
    dateRow.getCell(1).font = { bold: true, size: 10, color: { argb: isOff ? GRAY : WHITE } };
    dateRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: isOff ? P_OFF_BG : PURPLE } };
    dateRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    for (let c = 1; c <= pCols; c++) dateRow.getCell(c).border = borderAll();
    pr++;

    // ── Sub-header row ──
    const subHeaders = ["Employee", "Session", "IN", "OUT", "Duration", "Status"];
    const subRow = punchSheet.getRow(pr);
    subRow.height = 18;
    subHeaders.forEach((h, idx) => {
      const cell = subRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true, size: 8, color: { argb: GRAY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderAll();
    });
    pr++;

    // ── Employee rows for this date ──
    for (let ei2 = 0; ei2 < entries.length; ei2++) {
      const { empName, day } = entries[ei2];
      const sessions = day.sessions || [];
      const isEven = ei2 % 2 === 1;

      if (sessions.length === 0) {
        // No sessions — single row for absent / sunday / holiday / leave
        const row = punchSheet.getRow(pr);
        row.height = 16;
        const rowBg = isOff ? P_OFF_BG : (isEven ? P_STRIPE : WHITE);

        row.getCell(1).value = empName;
        row.getCell(1).font = { bold: true, size: 9, color: { argb: isOff ? GRAY : DARK } };
        row.getCell(2).value = "\u2014";
        row.getCell(3).value = "\u2014";
        row.getCell(4).value = "\u2014";
        row.getCell(5).value = "\u2014";
        row.getCell(6).value = statusLabels[day.status] || day.status;
        const sc2 = statusColors[day.status];
        if (sc2) {
          row.getCell(6).font = { bold: true, size: 9, color: { argb: `FF${sc2.fg}` } };
          row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${sc2.bg}` } };
        }

        for (let c = 1; c <= pCols; c++) {
          row.getCell(c).alignment = { horizontal: c === 1 ? "left" : "center", vertical: "middle" };
          row.getCell(c).border = borderAll();
          const ef = row.getCell(c).fill;
          if (c !== 6 && !(ef && "fgColor" in ef && ef.fgColor)) {
            row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          }
          if (!row.getCell(c).font?.size) row.getCell(c).font = { size: 9, color: { argb: isOff ? GRAY : DARK } };
        }
        pr++;
        continue;
      }

      // Session rows
      for (let si = 0; si < sessions.length; si++) {
        const sess = sessions[si];
        const row = punchSheet.getRow(pr);
        row.height = 16;
        const rowBg = isOff ? P_OFF_BG : (isEven ? P_STRIPE : WHITE);

        row.getCell(1).value = si === 0 ? empName : "";
        if (si === 0) row.getCell(1).font = { bold: true, size: 9, color: { argb: DARK } };
        row.getCell(2).value = `#${si + 1}`;
        row.getCell(2).font = { bold: true, size: 9, color: { argb: PURPLE } };
        row.getCell(3).value = fmtTimeIST(sess.inTime);
        row.getCell(4).value = sess.outTime ? fmtTimeIST(sess.outTime) : "\u2014";
        row.getCell(5).value = sess.durationMinutes ? fmtDur(sess.durationMinutes) : "\u2014";
        if (sess.durationMinutes) row.getCell(5).font = { bold: true, size: 9, color: { argb: PURPLE } };

        // Status on first session row only
        if (si === 0) {
          row.getCell(6).value = statusLabels[day.status] || day.status;
          const sc2 = statusColors[day.status];
          if (sc2) {
            row.getCell(6).font = { bold: true, size: 9, color: { argb: `FF${sc2.fg}` } };
            row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${sc2.bg}` } };
          }
        } else {
          row.getCell(6).value = "";
        }

        for (let c = 1; c <= pCols; c++) {
          row.getCell(c).alignment = { horizontal: c === 1 ? "left" : "center", vertical: "middle" };
          row.getCell(c).border = borderAll();
          const ef = row.getCell(c).fill;
          if (c !== 6 && !(ef && "fgColor" in ef && ef.fgColor)) {
            row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          }
          if (!row.getCell(c).font?.size) row.getCell(c).font = { size: 9, color: { argb: DARK } };
        }
        pr++;
      }
    }

    // Small gap between date groups
    punchSheet.getRow(pr).height = 4;
    pr++;
  }

  // ── Generated timestamp ──
  punchSheet.mergeCells(pr, 1, pr, pCols);
  const pGenRow = punchSheet.getRow(pr);
  pGenRow.getCell(1).value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
  pGenRow.getCell(1).font = { size: 8, italic: true, color: { argb: GRAY } };
  pGenRow.getCell(1).alignment = { horizontal: "right" };
  pGenRow.height = 16;

  punchSheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `flex-attendance-${month}.xlsx`);
}
