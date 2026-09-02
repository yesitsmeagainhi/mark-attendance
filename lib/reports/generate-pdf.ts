import type { ReportEmployee } from "./generate-excel";

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  "half-day": "Half Day",
  "short-day": "Short Day",
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
  "half-day": { bg: [255, 244, 220], fg: [168, 100, 0] },
  "short-day": { bg: [255, 237, 237], fg: [199, 51, 51] },
  leave: { bg: [239, 246, 255], fg: [37, 99, 235] },
  uh: { bg: [255, 244, 220], fg: [168, 100, 0] },
  sunday: { bg: [243, 244, 248], fg: [102, 112, 133] },
  "sunday-worked": { bg: [219, 234, 254], fg: [29, 78, 216] },
  holiday: { bg: [243, 244, 248], fg: [102, 112, 133] },
};

const offStatuses = new Set(["sunday", "holiday", "leave", "uh"]);

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
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
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
  const pw = doc.internal.pageSize.getWidth();
  const M = 14; // margin
  const cw = pw - M * 2; // content width

  // ── 1. TITLE BAR ──
  doc.setFillColor(109, 69, 229);
  doc.rect(M, 8, cw, 13, "F");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.setFont("Poppins", "bold");
  doc.text("ATTENDANCE & SALARY REPORT", pw / 2, 16.5, { align: "center" });

  // ── 2. MONTH LABEL ──
  const [yr, mn] = month.split("-");
  const monthLabel = new Date(Number(yr), Number(mn) - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  doc.setFontSize(9);
  doc.setFont("Poppins", "normal");
  doc.setTextColor(102, 112, 133);
  doc.text(monthLabel, pw / 2, 27, { align: "center" });

  // ── 3. EMPLOYEE INFO CARD ──
  const cardY = 30;
  const cardH = 17;
  doc.setFillColor(248, 249, 252);
  doc.rect(M, cardY, cw, cardH, "F");
  doc.setDrawColor(224, 226, 232);
  doc.setLineWidth(0.3);
  doc.rect(M, cardY, cw, cardH, "S");

  // Left: name + details
  doc.setFontSize(12);
  doc.setTextColor(23, 32, 51);
  doc.setFont("Poppins", "bold");
  doc.text(emp.name, M + 4, cardY + 7);
  doc.setFontSize(7.5);
  doc.setFont("Poppins", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text(`${emp.jobRole}  \u00B7  ${emp.office}  \u00B7  Shift: ${emp.shift}`, M + 4, cardY + 13);

  // Right: working days + ID
  doc.setFontSize(8);
  doc.setFont("Poppins", "bold");
  doc.setTextColor(109, 69, 229);
  doc.text(`${workingDays} Work Days`, pw - M - 4, cardY + 7, { align: "right" });
  doc.setFontSize(7);
  doc.setFont("Poppins", "normal");
  doc.setTextColor(156, 163, 175);
  doc.text(`ID: ${emp.id.length > 8 ? emp.id.slice(0, 8) + "\u2026" : emp.id}`, pw - M - 4, cardY + 13, { align: "right" });

  // ── 4. ATTENDANCE METRIC BOXES ──
  const boxY = cardY + cardH + 4;
  const boxH = 14;
  const gap = 2.5;
  const metrics: { label: string; value: string; bg: [number, number, number]; fg: [number, number, number] }[] = [
    { label: "Present", value: String(emp.presentDays), bg: [232, 247, 239], fg: [22, 128, 82] },
    { label: "Absent", value: String(emp.absentDays), bg: [255, 237, 237], fg: [199, 51, 51] },
    { label: "Half Day", value: String(emp.halfDays || 0), bg: [255, 244, 220], fg: [168, 100, 0] },
    { label: "Late", value: emp.lateAbsentDays > 0 ? `${emp.lateDays} (=${emp.lateAbsentDays}d)` : String(emp.lateDays), bg: [255, 244, 220], fg: [168, 100, 0] },
    { label: "Leave", value: String(emp.leaveDays), bg: [239, 246, 255], fg: [37, 99, 235] },
    { label: "Sun Work", value: String(emp.sundayWorkedDays), bg: [219, 234, 254], fg: [29, 78, 216] },
  ];
  const boxW = (cw - gap * (metrics.length - 1)) / metrics.length;
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    const bx = M + i * (boxW + gap);
    doc.setFillColor(...m.bg);
    doc.rect(bx, boxY, boxW, boxH, "F");
    // Value (centered, large bold)
    doc.setFontSize(11);
    doc.setFont("Poppins", "bold");
    doc.setTextColor(...m.fg);
    doc.text(m.value, bx + boxW / 2, boxY + 6.5, { align: "center" });
    // Label (centered, small)
    doc.setFontSize(6.5);
    doc.setFont("Poppins", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text(m.label, bx + boxW / 2, boxY + 11.5, { align: "center" });
  }

  // ── 5. SALARY BAR ──
  const salY = boxY + boxH + 3;
  const salH = 11;
  // Background
  doc.setFillColor(248, 249, 252);
  doc.rect(M, salY, cw, salH, "F");
  doc.setDrawColor(224, 226, 232);
  doc.setLineWidth(0.2);
  doc.rect(M, salY, cw, salH, "S");

  // Left: salary items
  const salItems: { label: string; value: string; color?: [number, number, number] }[] = [
    { label: "Salary", value: fmt(emp.monthlySalary) },
    { label: "Deduction", value: emp.deduction > 0 ? `-${fmt(emp.deduction)}` : "\u2014", color: emp.deduction > 0 ? [199, 51, 51] : undefined },
    { label: "Late Ded.", value: emp.lateAbsentDays > 0 ? `${emp.lateAbsentDays}d` : "\u2014" },
    { label: "Sun Bonus", value: emp.sundayBonus > 0 ? `+${fmt(emp.sundayBonus)}` : "\u2014", color: emp.sundayBonus > 0 ? [29, 78, 216] : undefined },
  ];
  const netPayW = 46;
  const salAreaW = cw - netPayW - 2;
  const salItemW = salAreaW / salItems.length;
  for (let i = 0; i < salItems.length; i++) {
    const s = salItems[i];
    const sx = M + 3 + i * salItemW;
    // Label
    doc.setFontSize(6);
    doc.setFont("Poppins", "normal");
    doc.setTextColor(156, 163, 175);
    doc.text(s.label, sx, salY + 4);
    // Value
    doc.setFontSize(8);
    doc.setFont("Poppins", "bold");
    doc.setTextColor(...(s.color || [23, 32, 51]));
    doc.text(s.value, sx, salY + 8.5);
  }

  // Net Pay highlight (green box on right)
  const npX = pw - M - netPayW;
  doc.setFillColor(232, 247, 239);
  doc.rect(npX, salY, netPayW, salH, "F");
  doc.setFontSize(6);
  doc.setFont("Poppins", "normal");
  doc.setTextColor(22, 128, 82);
  doc.text("NET PAY", npX + 3, salY + 4);
  doc.setFontSize(10);
  doc.setFont("Poppins", "bold");
  doc.text(fmt(emp.netPay), npX + 3, salY + 9);

  // Optional: Short Day / UH note
  let noteY = salY + salH + 1;
  const notes: string[] = [];
  if (emp.uhDays > 0) notes.push(`Unpaid Holidays: ${emp.uhDays}`);
  if (notes.length > 0) {
    doc.setFontSize(6.5);
    doc.setFont("Poppins", "italic");
    doc.setTextColor(156, 163, 175);
    doc.text(notes.join("   \u00B7   "), M + 2, noteY + 3);
    noteY += 4;
  }

  // ── 6. DAILY ATTENDANCE TABLE ──
  let totalBreakMins = 0;
  const bodyData = emp.dailyDetails.map((day) => {
    if (day.breakMinutes) totalBreakMins += day.breakMinutes;
    return [
      fmtDate(day.date),
      day.punchIn ? fmtTimeIST(day.punchIn) : "A",
      day.punchOut ? fmtTimeIST(day.punchOut) : "A",
      day.breakMinutes ? fmtDur(day.breakMinutes) : "\u2014",
      day.durationMinutes ? fmtDur(day.durationMinutes) : "A",
      statusLabels[day.status] || day.status,
    ];
  });

  autoTable(doc, {
    startY: noteY + 3,
    head: [["Date", "Punch In", "Punch Out", "Break", "Work Hours", "Status"]],
    body: bodyData,
    foot: [["TOTAL", "", "", totalBreakMins > 0 ? fmtDur(totalBreakMins) : "\u2014", emp.totalWorkedMinutes > 0 ? fmtDur(emp.totalWorkedMinutes) : "\u2014", ""]],
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1, right: 1.5, bottom: 1, left: 1.5 },
      halign: "center",
      valign: "middle",
      lineColor: [156, 163, 175],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [109, 69, 229],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
    },
    footStyles: {
      fillColor: [243, 244, 246],
      fontStyle: "bold",
      fontSize: 7.5,
      textColor: [23, 32, 51],
    },
    alternateRowStyles: {
      fillColor: [250, 250, 255],
    },
    columnStyles: {
      0: { cellWidth: 28, halign: "left", fontStyle: "bold" },
      5: { cellWidth: 22 },
    },
    didParseCell(data: { section: string; column: { index: number }; row: { index: number }; cell: { styles: { fillColor: number[]; textColor: number[]; fontStyle: string } } }) {
      if (data.section !== "body") return;
      const dayDetail = emp.dailyDetails[data.row.index];
      if (!dayDetail) return;

      // Off-day rows: muted gray background (overrides alternate stripe)
      if (offStatuses.has(dayDetail.status)) {
        data.cell.styles.fillColor = [243, 244, 248];
        if (data.column.index !== 5) {
          data.cell.styles.textColor = [156, 163, 175];
        }
      }

      // Status cell: colored badge
      if (data.column.index === 5) {
        const sc = statusColors[dayDetail.status];
        if (sc) {
          data.cell.styles.fillColor = [...sc.bg];
          data.cell.styles.textColor = [...sc.fg];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: M, right: M },
  });

  // ── 7. FOOTER ──
  doc.setFontSize(6.5);
  doc.setFont("Poppins", "normal");
  doc.setTextColor(156, 163, 175);
  const ph = doc.internal.pageSize.getHeight();
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
    pw - M,
    ph - 6,
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
