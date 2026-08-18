import type { ReportEmployee } from "./generate-excel";

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  leave: "Leave",
  uh: "UH",
  sunday: "Sunday",
  "sunday-worked": "Sun Work",
  holiday: "Holiday",
};

const statusColors: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
  present: { bg: [232, 247, 239], fg: [22, 128, 82] },
  late: { bg: [255, 244, 220], fg: [168, 100, 0] },
  absent: { bg: [255, 237, 237], fg: [199, 51, 51] },
  leave: { bg: [239, 246, 255], fg: [37, 99, 235] },
  uh: { bg: [255, 244, 220], fg: [168, 100, 0] },
  sunday: { bg: [243, 244, 248], fg: [102, 112, 133] },
  "sunday-worked": { bg: [219, 234, 254], fg: [29, 78, 216] },
  holiday: { bg: [243, 244, 248], fg: [102, 112, 133] },
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

function buildEmployeePage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  emp: ReportEmployee,
  month: string,
  workingDays: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: any,
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title bar
  doc.setFillColor(109, 69, 229);
  doc.rect(14, 10, pageWidth - 28, 12, "F");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("ATTENDANCE & SALARY REPORT", pageWidth / 2, 18, { align: "center" });

  // Month
  doc.setFontSize(10);
  doc.setTextColor(102, 112, 133);
  doc.text(`Month: ${month}`, pageWidth / 2, 28, { align: "center" });

  // Employee info table (2-column key-value layout)
  const infoData = [
    ["Employee Name", emp.name, "Monthly Salary", fmt(emp.monthlySalary)],
    ["Employee ID", emp.id, "Per Day Pay", fmt(emp.perDayRate)],
    ["Branch", emp.office, "Present Days", String(emp.presentDays)],
    ["Job Role", emp.jobRole, "Absent Days", String(emp.absentDays)],
    ["Shift Timing", emp.shift, "Late Days", `${emp.lateDays}${emp.lateAbsentDays > 0 ? ` (= ${emp.lateAbsentDays}d ded.)` : ""}`],
    ["Joining Date", fmtJoinDate(emp.createdAt), "Leave Days", String(emp.leaveDays)],
    ["Working Days", String(workingDays), "Weekly Offs", String(emp.weeklyOffs)],
    ["Sunday Worked", `${emp.sundayWorkedDays}${emp.sundayBonus > 0 ? ` (+${fmt(emp.sundayBonus)})` : ""}`, "Deduction", fmt(emp.deduction)],
    ["", "", "Net Pay", fmt(emp.netPay)],
  ];

  autoTable(doc, {
    startY: 32,
    body: infoData,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [102, 112, 133], cellWidth: 35 },
      1: { cellWidth: 55 },
      2: { fontStyle: "bold", textColor: [102, 112, 133], cellWidth: 35 },
      3: { cellWidth: 55 },
    },
    didParseCell(data: { column: { index: number }; row: { index: number }; cell: { styles: { fillColor: number[]; fontStyle: string; textColor: number[] } } }) {
      // Highlight Net Pay value
      if (data.column.index === 3 && data.row.index === 8) {
        data.cell.styles.fillColor = [232, 247, 239];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Daily attendance table
  let totalBreakMins = 0;
  let totalSalary = 0;

  const bodyData = emp.dailyDetails.map((day) => {
    const isWorkDay = day.status === "present" || day.status === "late";
    const isSundayWorked = day.status === "sunday-worked";
    const daySalary = isSundayWorked ? emp.perDayRate : (isWorkDay ? emp.perDayRate : 0);
    if (isWorkDay || isSundayWorked) totalSalary += daySalary;
    if (day.breakMinutes) totalBreakMins += day.breakMinutes;

    return [
      fmtDate(day.date),
      fmtDay(day.date),
      statusLabels[day.status] || day.status,
      day.punchIn ? fmtTimeIST(day.punchIn) : "\u2014",
      day.punchOut ? fmtTimeIST(day.punchOut) : "\u2014",
      day.breakMinutes ? fmtDur(day.breakMinutes) : "\u2014",
      day.durationMinutes ? fmtDur(day.durationMinutes) : "\u2014",
      (isWorkDay || isSundayWorked) ? fmt(daySalary) : "\u2014",
    ];
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevY = (doc as any).lastAutoTable?.finalY || 80;

  autoTable(doc, {
    startY: prevY + 6,
    head: [["Date", "Day", "Status", "Punch In", "Punch Out", "Break", "Work Hours", "Salary"]],
    body: bodyData,
    foot: [["TOTAL", "", "", "", "", totalBreakMins > 0 ? fmtDur(totalBreakMins) : "\u2014", emp.totalWorkedMinutes > 0 ? fmtDur(emp.totalWorkedMinutes) : "\u2014", fmt(totalSalary)]],
    // styles: { fontSize: 7, cellPadding: 2, halign: "center" },
    styles: {
      fontSize: 8,
      cellPadding: { top: 0.65, right: 1, bottom: 0.65, left: 1 },
      minCellHeight: 3.7,
      halign: "center",
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [109, 69, 229],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 1, right: 1, bottom: 1, left: 1 },
    },
    footStyles: {
      fillColor: [249, 250, 251],
      fontStyle: "bold",
      fontSize: 8,
      textColor: [23, 32, 51],
      cellPadding: { top: 1, right: 1, bottom: 1, left: 1 },
    },
    // headStyles: { fillColor: [109, 69, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
    // footStyles: { fillColor: [249, 250, 251], fontStyle: "bold", fontSize: 8, textColor: [23, 32, 51] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      2: { cellWidth: 22 },
      7: { cellWidth: 30 },
    },
    didParseCell(data: { section: string; column: { index: number }; cell: { styles: { fillColor: number[]; textColor: number[]; fontStyle: string } }; row: { raw: string[] } }) {
      if (data.section === "body" && data.column.index === 2) {
        const status = Object.keys(statusLabels).find((k) => statusLabels[k] === data.row.raw[2]);
        if (status && statusColors[status]) {
          data.cell.styles.fillColor = [...statusColors[status].bg];
          data.cell.styles.textColor = [...statusColors[status].fg];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(102, 112, 133);
  const pageH = doc.internal.pageSize.getHeight();
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
    pageWidth - 14,
    pageH - 8,
    { align: "right" },
  );
}

export async function generateEmployeePDF(
  emp: ReportEmployee,
  month: string,
  workingDays: number,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  buildEmployeePage(doc, emp, month, workingDays, autoTable);
  doc.save(`${emp.name.replace(/\s+/g, "-")}-report-${month}.pdf`);
}

export async function generateAllEmployeesPDF(
  employees: ReportEmployee[],
  month: string,
  workingDays: number,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

  for (let i = 0; i < employees.length; i++) {
    if (i > 0) doc.addPage();
    buildEmployeePage(doc, employees[i], month, workingDays, autoTable);
  }

  doc.save(`attendance-report-${month}.pdf`);
}
