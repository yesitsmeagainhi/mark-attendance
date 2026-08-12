import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("employee"),
  jobRole: text("job_role").notNull().default(""),
  mobileNumber: text("mobile_number").notNull().default(""),
  workStartTime: text("work_start_time").notNull().default("09:00"),
  workEndTime: text("work_end_time").notNull().default("18:00"),
  office: text("office").notNull().default("Bhayandar Office"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  monthlySalary: integer("monthly_salary").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attendance = sqliteTable("attendance", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  punchType: text("punch_type", { enum: ["IN", "OUT"] }).notNull(),
  serverTimestamp: text("server_timestamp").notNull().default(sql`CURRENT_TIMESTAMP`),
  photoKey: text("photo_key").notNull(),
  contentType: text("content_type").notNull().default("image/jpeg"),
  office: text("office").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  userAgent: text("user_agent"),
  source: text("source").notNull().default("selfie"),
});

export const missPunchRequests = sqliteTable("miss_punch_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  date: text("date").notNull(),
  punchType: text("punch_type", { enum: ["IN", "OUT"] }).notNull(),
  requestedTime: text("requested_time").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedAt: text("reviewed_at"),
});

export const leaveRequests = sqliteTable("leave_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  leaveType: text("leave_type", { enum: ["sick", "casual", "earned"] }).notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedAt: text("reviewed_at"),
});

export const holidays = sqliteTable("holidays", {
  id: text("id").primaryKey(),
  date: text("date").notNull().unique(),
  type: text("type").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dailyJournals = sqliteTable("daily_journals", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  date: text("date").notNull(),
  tasks: text("tasks").notNull(),
  todos: text("todos").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})
export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  token: text("token").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  userAgent: text("user_agent"),
});

export const otpRequests = sqliteTable("otp_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  otpCode: text("otp_code").notNull(),
  status: text("status", { enum: ["pending", "used", "expired"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
});

export const attendanceRules = sqliteTable("attendance_rules", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  description: text("description"),
  valueType: text("value_type", { enum: ["number", "boolean"] }).notNull(),
  defaultValue: text("default_value").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const employeeRuleOverrides = sqliteTable("employee_rule_overrides", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  ruleId: text("rule_id").notNull().references(() => attendanceRules.id),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
