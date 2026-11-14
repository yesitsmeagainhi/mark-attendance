// Small helper for one-sheet Excel files (replaces the old CSV downloads).
// Works in the browser and in Node; exceljs is loaded only when a file is made.

export type Cell = string | number | null | undefined;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Build an .xlsx with a bold, frozen header row and sensible column widths. */
export async function buildSimpleXlsx(sheetName: string, headers: string[], rows: Cell[][]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName.slice(0, 31));
  sheet.addRow(headers);
  for (const r of rows) sheet.addRow(r.map((v) => (v === null || v === undefined ? "" : v)));

  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D45E5" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  headers.forEach((h, i) => {
    const longest = Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length));
    sheet.getColumn(i + 1).width = Math.min(50, Math.max(10, longest + 2));
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Browser only: build the file and start the download. */
export async function downloadSimpleXlsx(fileName: string, sheetName: string, headers: string[], rows: Cell[][]) {
  const buffer = await buildSimpleXlsx(sheetName, headers, rows);
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_TYPE }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
