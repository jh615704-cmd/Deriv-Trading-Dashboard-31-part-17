import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const approvedUsersTable = pgTable("approved_users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApprovedUserSchema = createInsertSchema(approvedUsersTable);
export type InsertApprovedUser = z.infer<typeof insertApprovedUserSchema>;
export type ApprovedUser = typeof approvedUsersTable.$inferSelect;