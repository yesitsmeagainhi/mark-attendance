import ExcelJS from "exceljs";

export type SheetRow = Record<string, string>;

// ExcelJS cell values can be objects (hyperlinks, rich text, formulas, etc.)
// This extracts the plain text string from any cell value type.
export function cellToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (val instanceof Date) {
    // Excel stores time-only values (e.g. "09:00") as Date with base year 1899/1900
    if (val.getFullYear() <= 1900) {
      const h = String(val.getUTCHours()).padStart(2, "0");
      const m = String(val.getUTCMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    }
    return val.toISOString();
  }
  if (typeof val === "object") {
    // Hyperlink: { text: "...", hyperlink: "..." }
    if ("text" in val && typeof (val as { text: unknown }).text === "string") return (val as { text: string }).text;
    // Rich text: { richText: [{ text: "..." }, ...] }
    if ("richText" in val && Array.isArray((val as { richText: unknown[] }).richText)) {
      return (val as { richText: { text: string }[] }).richText.map((r) => r.text || "").join("");
    }
    // Formula result: { result: "..." }
    if ("result" in val) return cellToString((val as { result: unknown }).result);
  }
  return String(val);
}

/** Read the first worksheet; row 1 is the header row. */
export async function parseXlsxRows(buffer: ArrayBuffer): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(buffer) as any);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return [];

  // Read headers from first row
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNum) => {
    headers[colNum] = cellToString(cell.value).trim();
  });

  const rows: SheetRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: SheetRow = {};
    let hasAnyValue = false;
    row.eachCell((cell, colNum) => {
      const header = headers[colNum];
      if (header) {
        obj[header] = cellToString(cell.value).trim();
        if (obj[header]) hasAnyValue = true;
      }
    });
    if (hasAnyValue) rows.push(obj);
  }
  return rows;
}

export function parseCSVRows(text: string): SheetRow[] {
  // Strip the BOM Excel adds when saving as "CSV UTF-8"
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  const rows: SheetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const obj: SheetRow = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (values[j] || "").trim();
    }
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}
