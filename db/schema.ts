import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("employee"),
  office: text("office").notNull().default("Airoli Office"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
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
});
