import { createHash } from "node:crypto";
import { sql, desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";
import { requireApiRole } from "../../../authz";
import ExcelJS from "exceljs";

type RowInput = {
  name?: string;
  email?: string;
  password?: string;
  jobRole?: string;
  department?: string;
  mobileNumber?: string;
  workStartTime?: string;
  workEndTime?: string;
  office?: string;
  monthlySalary?: number | string;
};

type RowError = { row: number; field: string; message: string };

const EXPECTED_HEADERS = ["name", "email", "password", "jobRole", "department", "mobileNumber", "workStartTime", "workEndTime", "office", "monthlySalary"];

function processRows(rows: RowInput[]) {
  const db = getDb();

  const existingEmails = new Set(
    db.select({ email: employees.email }).from(employees).all()
      .map((e) => e.email.toLowerCase()),
  );

  // Get all existing mobile numbers for duplicate checking
  const existingMobiles = new Set(
    db.select({ mobileNumber: employees.mobileNumber }).from(employees).all()
      .map((e) => e.mobileNumber)
      .filter((m) => m && m.length > 0),
  );

  const lastEmployee = db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`${employees.id} LIKE 'EMP-%'`)
    .orderBy(desc(employees.id))
    .limit(1)
    .get();

  let nextNum = 1001;
  if (lastEmployee) {
    const num = parseInt(lastEmployee.id.replace("EMP-", ""), 10);
    if (!isNaN(num)) nextNum = num + 1;
  }

  const errors: RowError[] = [];
  const validRows: Array<{
    id: string;
    name: string;
    email: string;
    password: string;
    jobRole: string;
    department: string;
    mobileNumber: string;
    workStartTime: string;
    workEndTime: string;
    office: string;
    monthlySalary: number;
  }> = [];

  const batchEmails = new Set<string>();
  const batchMobiles = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const name = row.name?.toString().trim();
    const email = row.email?.toString().trim().toLowerCase();
    const password = row.password?.toString();
    const jobRole = row.jobRole?.toString().trim() || "";
    const department = row.department?.toString().trim() || "";
    const mobileNumber = row.mobileNumber?.toString().replace(/\D/g, "") || "";
    const workStartTime = row.workStartTime?.toString().trim() || "09:00";
    const workEndTime = row.workEndTime?.toString().trim() || "18:00";
    const office = row.office?.toString().trim() || "Bhayandar Office";
    const monthlySalary = Math.max(0, Math.round(Number(row.monthlySalary) || 0));

    let hasError = false;
    function addError(field: string, message: string) {
      errors.push({ row: rowNum, field, message });
      hasError = true;
    }

    if (!name) addError("name", "Name is required.");
    if (!email) {
      addError("email", "Email is required.");
    } else if (existingEmails.has(email)) {
      addError("email", `Email "${email}" already exists.`);
    } else if (batchEmails.has(email)) {
      addError("email", `Duplicate email "${email}" in import.`);
    }
    if (!password || password.length < 4) addError("password", "Password must be at least 4 characters.");
    if (mobileNumber && mobileNumber.length !== 10) {
      addError("mobileNumber", "Mobile number must be 10 digits.");
    } else if (mobileNumber && existingMobiles.has(mobileNumber)) {
      addError("mobileNumber", `Mobile number "${mobileNumber}" already exists.`);
    } else if (mobileNumber && batchMobiles.has(mobileNumber)) {
      addError("mobileNumber", `Duplicate mobile number "${mobileNumber}" in import.`);
    }

    if (hasError) continue;

    batchEmails.add(email!);
    if (mobileNumber) batchMobiles.add(mobileNumber);
    const hashedPassword = createHash("sha256").update(password!).digest("hex");
    const id = `EMP-${nextNum++}`;

    validRows.push({
      id,
      name: name!,
      email: email!,
      password: hashedPassword,
      jobRole,
      department,
      mobileNumber,
      workStartTime,
      workEndTime,
      office,
      monthlySalary,
    });
  }

  const created: Array<{ id: string; name: string; email: string }> = [];
  if (validRows.length > 0) {
    db.transaction((tx) => {
      for (const row of validRows) {
        tx.insert(employees)
          .values({
            id: row.id,
            name: row.name,
            email: row.email,
            password: row.password,
            role: "employee",
            jobRole: row.jobRole,
            mobileNumber: row.mobileNumber,
            workStartTime: row.workStartTime,
            workEndTime: row.workEndTime,
            office: row.office,
            department: row.department,
            monthlySalary: row.monthlySalary,
          })
          .run();
        created.push({ id: row.id, name: row.name, email: row.email });
      }
    });
  }

  return { created, errors };
}

// ExcelJS cell values can be objects (hyperlinks, rich text, formulas, etc.)
// This extracts the plain text string from any cell value type.
function cellToString(val: unknown): string {
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

async function parseXlsxRows(buffer: ArrayBuffer): Promise<RowInput[]> {
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

  const rows: RowInput[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, string> = {};
    let hasAnyValue = false;
    row.eachCell((cell, colNum) => {
      const header = headers[colNum];
      if (header) {
        obj[header] = cellToString(cell.value).trim();
        if (obj[header]) hasAnyValue = true;
      }
    });
    if (hasAnyValue) rows.push(obj as RowInput);
  }
  return rows;
}

export async function POST(request: Request) {
  const auth = await requireApiRole("admin");
  if ("error" in auth) return auth.error;

  const contentType = request.headers.get("content-type") || "";
  let rows: RowInput[];

  if (contentType.includes("multipart/form-data")) {
    // File upload (XLSX or CSV)
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No file uploaded." }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".xlsx")) {
      const buffer = await file.arrayBuffer();
      rows = await parseXlsxRows(buffer);
    } else if (fileName.endsWith(".csv")) {
      const text = await file.text();
      rows = parseCSVRows(text);
    } else {
      return Response.json({ error: "Unsupported file format. Please upload a .csv or .xlsx file." }, { status: 400 });
    }
  } else {
    // JSON body (from CSV parsed client-side)
    let body: { employees?: RowInput[] };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    rows = body.employees || [];
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: "No employee data found in file." }, { status: 400 });
  }

  if (rows.length > 500) {
    return Response.json({ error: "Maximum 500 employees per import." }, { status: 400 });
  }

  const result = processRows(rows);
  return Response.json(result, { status: result.created.length > 0 ? 201 : 400 });
}

function parseCSVRows(text: string): RowInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  const rows: RowInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (values[j] || "").trim();
    }
    rows.push(obj as RowInput);
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
