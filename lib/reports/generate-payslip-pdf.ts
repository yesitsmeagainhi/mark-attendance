import type { PayslipData } from "../payslips";
import { amountText, payslipDetails, payslipTable, type PayslipRow } from "../payslip-layout";

/** The built-in PDF font can't draw ₹ or some symbols; spell them out. */
function pdfText(s: string): string {
  return s.replace(/₹/g, "Rs ").replace(/→/g, "->").replace(/−/g, "-").replace(/—/g, "-").replace(/×/g, "x").replace(/÷/g, "/");
}
const rs = (n: number) => `Rs ${amountText(n)}`;

type Slip = PayslipData & { publishedAt?: string };

/** File name used by both the browser download and the app's PDF endpoint. */
export function payslipFileName(slip: Slip): string {
  const name = slip.employee.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "Employee";
  return `Payslip-${name}-${slip.month}.pdf`;
}

/** One-page A4 payslip in plain black and white, downloaded in the browser. */
export async function generatePayslipPDF(slip: Slip) {
  const doc = await buildPayslipPDF(slip);
  doc.save(payslipFileName(slip));
}

/** The same PDF as raw bytes, for the server (the mobile app downloads it). */
export async function payslipPdfBytes(slip: Slip): Promise<ArrayBuffer> {
  const doc = await buildPayslipPDF(slip);
  return doc.output("arraybuffer");
}

/** Lay out the payslip. Works in the browser and on the server (Node). */
async function buildPayslipPDF(slip: Slip) {
  // Node loads jspdf's CommonJS build, whose default export is the module
  // object, not the class; the browser build's default is the class.
  // The named export works in both.
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF ?? jspdfModule.default;
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const M = 18;
  const cx = pw / 2;
  const t = payslipTable(slip);
  const d = payslipDetails(slip);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // Header
  let y = 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Payslip", cx, y, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  y += 6.5;
  doc.text(pdfText(slip.company?.name || "Company"), cx, y, { align: "center" });
  for (const line of (slip.company?.address || "").split(/\r?\n/).filter((l) => l.trim())) {
    y += 5;
    doc.text(pdfText(line.trim()), cx, y, { align: "center" });
  }

  // Details between two rules: two columns of "Label : value"
  y += 7;
  doc.setLineWidth(0.3);
  doc.line(M, y, pw - M, y);
  y += 7;
  doc.setFontSize(10);
  const colX = [M, cx + 4];
  const valueOffset = 32;
  const rows = Math.max(d.left.length, d.right.length);
  for (let i = 0; i < rows; i++) {
    [d.left[i], d.right[i]].forEach((pair, c) => {
      if (!pair) return;
      doc.setFont("helvetica", "normal");
      doc.text(pdfText(pair[0]), colX[c], y);
      doc.setFont("helvetica", "bold");
      doc.text(`: ${pdfText(pair[1])}`, colX[c] + valueOffset, y, { maxWidth: pw / 2 - M - valueOffset });
    });
    y += 5.8;
  }
  y += 1;
  doc.line(M, y, pw - M, y);

  // Earnings (left) and deductions (right)
  const gap = 6;
  const colW = (pw - 2 * M - gap) / 2;
  const top = y + 7;
  const section = (title: string, list: PayslipRow[], totalLabel: string, total: number, sign: string, left: number) => {
    const body = list.length
      ? list.map((r) => [`${pdfText(r.label)}${r.note ? `\n${pdfText(r.note)}` : ""}`, `${sign}${rs(r.amount)}`])
      : [[`No ${title.toLowerCase()} this month`, ""]];
    body.push([totalLabel, `${sign}${rs(total)}`]);
    autoTable(doc, {
      startY: top,
      margin: { left, right: pw - left - colW },
      tableWidth: colW,
      head: [[title, "Amount"]],
      body,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9.5, textColor: [0, 0, 0], cellPadding: 2.2, lineColor: [0, 0, 0], valign: "top" },
      headStyles: { fontStyle: "bold", fontSize: 10.5, lineWidth: { bottom: 0.3 } },
      columnStyles: { 1: { halign: "right", cellWidth: 30 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.lineWidth = { top: 0.3 };
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const end = (doc as any).lastAutoTable.finalY as number;
    doc.setLineWidth(0.3);
    doc.rect(left, top, colW, end - top);
    return end;
  };
  const endLeft = section("Earnings", t.earnings, "Total earnings", t.totalEarnings, "", M);
  const endRight = section("Deductions", t.deductions, "Total deductions", t.totalDeductions, "-", M + colW + gap);
  y = Math.max(endLeft, endRight) + 10;

  // Net pay, shown once
  const boxH = 30;
  doc.setLineWidth(0.6);
  doc.rect(M, y, pw - 2 * M, boxH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("NET PAY", cx, y + 6.5, { align: "center" });
  doc.setFontSize(17);
  doc.text(rs(t.netPay), cx, y + 14.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`${rs(t.totalEarnings)} earned - ${rs(t.totalDeductions)} deducted`, cx, y + 20.5, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.text(t.netPayWords, cx, y + 25.5, { align: "center", maxWidth: pw - 2 * M - 8 });

  // Signatures
  y += boxH + 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const sigW = 60;
  // doc.text("Employer Signature", M + sigW / 2, y, { align: "center" });
  // doc.text("Employee Signature", pw - M - sigW / 2, y, { align: "center" });
  y += 20;
  doc.setLineWidth(0.3);
  // doc.line(M, y, M + sigW, y);
  // doc.line(pw - M - sigW, y, pw - M, y);

  doc.setFontSize(9);
  doc.text("This is system generated payslip", cx, y + 14, { align: "center" });

  return doc;
}
