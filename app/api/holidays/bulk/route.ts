import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getDb } from "../../../../db";
import { holidays } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import { logActivity } from "../../../../lib/activity-logger";
import { getPayrollEmployees, saveHolidayOverrides } from "../../../../lib/holidays";
import { parseCSVRows, parseXlsxRows, type SheetRow } from "../../../../lib/spreadsheet-import";

const COLUMNS = ["date", "name", "paid", "notPaidFor", "paidFor"] as const;
const MAX_ROWS = 366;

/** Example rows, using real employee IDs so the template validates as-is. */
function exampleRows() {
  const ids = getPayrollEmployees().filter((e) => !e.flexibleHours).map((e) => e.id);
  const a = ids[0] || "EMP-1001";
  const b = ids[1] || a;
  return [
    ["2026-12-25", "Christmas", "Yes", "", ""],
    ["2027-01-26", "Republic Day", "Yes", a, ""],
    ["2027-03-15", "Office closed (example)", "No", "", ids.length > 1 ? `${a}; ${b}` : a],
  ];
}

const INSTRUCTIONS: [string, string][] = [
  ["date", "Required. Holiday date: YYYY-MM-DD (2026-12-25) or DD-MM-YYYY / DD/MM/YYYY (25/12/2026). Past dates are allowed and recalculate payroll for that day."],
  ["name", "Required. Holiday name, e.g. Diwali."],
  ["paid", "Yes or No. Blank means Yes. Yes = no salary deduction for eligible employees. No = one day deducted unless listed in paidFor."],
  ["notPaidFor", "Optional. Only for paid holidays. Employees who should NOT be paid for this day. Use employee ID, email or exact name, separated by ; (semicolon)."],
  ["paidFor", "Optional. Employees who SHOULD be paid even though they are not eligible by default, or the holiday is unpaid. Same format as notPaidFor."],
  ["", ""],
  ["Who is paid by default?", "On a paid holiday, every employee marked \"Eligible\" in Holidays > Paid holiday eligibility. Hourly (flex) employees are paid by hours and are not affected."],
  ["Existing dates", "If a date is already in the holiday list, the row is rejected unless you tick \"Update holidays that already exist\" when uploading."],
  ["Example rows", "The rows in the Holidays sheet are examples. Replace them with your own before uploading."],
];

type RowResult = {
  row: number;
  date: string;
  name: string;
  paid: boolean;
  paidCount: number;
  exceptions: string[];
  action: "create" | "update";
};
type RowError = { row: number; message: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function toDateString(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Accepts YYYY-MM-DD (incl. ISO timestamps from Excel), DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, "25 Dec 2026", Excel serials. */
function parseDate(raw: string): string | null {
  const v = raw.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (m) return toDateString(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return toDateString(+m[3], +m[2], +m[1]);
  m = v.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]*(\d{4})$/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return mon > 0 ? toDateString(+m[3], mon, +m[1]) : null;
  }
  if (/^\d{5}$/.test(v)) {
    // Excel serial date (days since 1899-12-30)
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000);
    return toDateString(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}

function parsePaid(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v || ["yes", "y", "true", "1", "paid"].includes(v)) return true;
  if (["no", "n", "false", "0", "unpaid"].includes(v)) return false;
  return null;
}

/** Map headers case/space-insensitively onto the expected column names. */
function normalizeRow(row: SheetRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const k = key.replace(/[\s_]/g, "").toLowerCase();
    const col = COLUMNS.find((c) => c.toLowerCase() === k);
    if (col) out[col] = value ?? "";
  }
  return out;
}

function processRows(rows: SheetRow[], overwrite: boolean) {
  const db = getDb();
  const emps = getPayrollEmployees();
  const salaried = emps.filter((e) => !e.flexibleHours);
  const findEmp = (ref: string) => {
    const r = ref.trim().toLowerCase();
    return emps.find((e) => e.id.toLowerCase() === r || e.email.toLowerCase() === r || e.name.toLowerCase() === r);
  };

  const existing = new Map(db.select({ id: holidays.id, date: holidays.date }).from(holidays).all().map((h) => [h.date, h.id]));
  const seenDates = new Set<string>();
  const valid: (RowResult & { paidEmployeeIds: string[] })[] = [];
  const errors: RowError[] = [];

  rows.forEach((raw, i) => {
    const rowNum = i + 2; // +1 for header row, +1 for 1-based
    const row = normalizeRow(raw);
    const rowErrors: string[] = [];

    const date = parseDate(row.date || "");
    if (!row.date?.trim()) rowErrors.push("date is required.");
    else if (!date) rowErrors.push(`"${row.date}" is not a valid date. Use YYYY-MM-DD or DD-MM-YYYY.`);

    const name = (row.name || "").trim();
    if (name.length < 2) rowErrors.push("name is required (minimum 2 characters).");

    const paid = parsePaid(row.paid || "");
    if (paid === null) rowErrors.push(`paid must be Yes or No (got "${row.paid}").`);

    if (date) {
      if (seenDates.has(date)) rowErrors.push(`${date} appears more than once in this file.`);
      else if (existing.has(date) && !overwrite) rowErrors.push(`${date} is already in the holiday list. Tick "Update holidays that already exist" to replace it.`);
    }

    const resolveList = (value: string, column: string) => {
      const ids: string[] = [];
      for (const ref of value.split(/[;|\n]/).map((s) => s.trim()).filter(Boolean)) {
        const emp = findEmp(ref);
        if (!emp) rowErrors.push(`${column}: no active employee matches "${ref}".`);
        else if (!emp.flexibleHours) ids.push(emp.id);
      }
      return ids;
    };
    const notPaidIds = resolveList(row.notPaidFor || "", "notPaidFor");
    const paidIds = resolveList(row.paidFor || "", "paidFor");

    if (rowErrors.length > 0 || !date || paid === null) {
      for (const message of rowErrors) errors.push({ row: rowNum, message });
      return;
    }
    seenDates.add(date);

    const paidSet = new Set(paid ? salaried.filter((e) => e.paidHolidays).map((e) => e.id) : []);
    for (const id of notPaidIds) paidSet.delete(id);
    for (const id of paidIds) paidSet.add(id);

    valid.push({
      row: rowNum,
      date,
      name,
      paid,
      paidCount: paidSet.size,
      exceptions: [
        ...notPaidIds.map((id) => `not paid: ${emps.find((e) => e.id === id)!.name}`),
        ...paidIds.map((id) => `paid: ${emps.find((e) => e.id === id)!.name}`),
      ],
      action: existing.has(date) ? "update" : "create",
      paidEmployeeIds: [...paidSet],
    });
  });

  return { valid, errors, existing, salariedCount: salaried.length };
}

export async function GET(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  if (format === "csv") {
    const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [COLUMNS.join(","), ...exampleRows().map((r) => r.map(quote).join(","))].join("\r\n") + "\r\n";
    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="holiday_template.csv"',
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Holidays");
  sheet.columns = [
    { header: "date", key: "date", width: 14 },
    { header: "name", key: "name", width: 28 },
    { header: "paid", key: "paid", width: 8 },
    { header: "notPaidFor", key: "notPaidFor", width: 30 },
    { header: "paidFor", key: "paidFor", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D45E5" } };
  // Keep dates as text so Excel doesn't reformat them
  sheet.getColumn(1).numFmt = "@";
  for (const ex of exampleRows()) sheet.addRow(ex);
  for (let r = 2; r <= 200; r++) {
    sheet.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Yes,No"'] };
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const help = wb.addWorksheet("Instructions");
  help.columns = [{ header: "Column", key: "c", width: 24 }, { header: "How to fill it", key: "h", width: 110 }];
  help.getRow(1).font = { bold: true };
  for (const [c, h] of INSTRUCTIONS) help.addRow([c, h]).alignment = { wrapText: true, vertical: "top" };

  const list = wb.addWorksheet("Employees");
  list.columns = [
    { header: "Employee ID", key: "id", width: 14 },
    { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 30 },
    { header: "Paid holidays", key: "eligible", width: 16 },
  ];
  list.getRow(1).font = { bold: true };
  for (const e of getPayrollEmployees()) {
    list.addRow([e.id, e.name, e.email, e.flexibleHours ? "Hourly (n/a)" : e.paidHolidays ? "Eligible" : "Not eligible"]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="holiday_template.xlsx"',
    },
  });
}

/**
 * multipart/form-data: file (.csv/.xlsx), dryRun ("true" = validate only), overwrite ("true" = update existing dates).
 */
export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const dryRun = formData.get("dryRun") === "true";
  const overwrite = formData.get("overwrite") === "true";
  if (!file) return Response.json({ error: "No file uploaded." }, { status: 400 });

  const fileName = file.name.toLowerCase();
  let rows: SheetRow[];
  try {
    if (fileName.endsWith(".xlsx")) rows = await parseXlsxRows(await file.arrayBuffer());
    else if (fileName.endsWith(".csv")) rows = parseCSVRows(await file.text());
    else return Response.json({ error: "Unsupported file format. Please upload a .csv or .xlsx file." }, { status: 400 });
  } catch {
    return Response.json({ error: "Could not read the file. Make sure it is a valid .csv or .xlsx file." }, { status: 400 });
  }

  if (rows.length === 0) return Response.json({ error: "No holiday rows found. The file needs a header row and at least one data row." }, { status: 400 });
  if (rows.length > MAX_ROWS) return Response.json({ error: `Maximum ${MAX_ROWS} holidays per upload.` }, { status: 400 });

  const { valid, errors, existing, salariedCount } = processRows(rows, overwrite);
  const preview: RowResult[] = valid.map((r) => ({
    row: r.row, date: r.date, name: r.name, paid: r.paid, paidCount: r.paidCount, exceptions: r.exceptions, action: r.action,
  }));

  if (dryRun) return Response.json({ rows: preview, errors, salariedCount });
  if (errors.length > 0) {
    return Response.json({ error: "Fix the errors in the file and upload again. Nothing was imported.", rows: preview, errors, salariedCount }, { status: 400 });
  }

  const db = getDb();
  db.transaction(() => {
    for (const r of valid) {
      const type = r.paid ? "paid_holiday" : "unpaid_holiday";
      let id = existing.get(r.date);
      if (id) {
        db.update(holidays).set({ name: r.name, paid: r.paid, type }).where(eq(holidays.id, id)).run();
      } else {
        id = crypto.randomUUID();
        db.insert(holidays).values({ id, date: r.date, name: r.name, paid: r.paid, type }).run();
      }
      saveHolidayOverrides(id, r.paid, r.paidEmployeeIds);
    }
  });

  const created = valid.filter((r) => r.action === "create").length;
  const updated = valid.length - created;
  logActivity({
    actionType: "holiday_added",
    performedBy: auth.identity.employeeId,
    performedByName: auth.identity.displayName,
    description: `Admin imported holidays from ${file.name} (${created} added, ${updated} updated)`,
    metadata: { fileName: file.name, created, updated },
  });

  return Response.json({ ok: true, created, updated, rows: preview, salariedCount }, { status: 201 });
}
