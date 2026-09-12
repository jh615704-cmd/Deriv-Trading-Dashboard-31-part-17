import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const accessKeysTable = pgTable("access_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  label: text("label").notNull(),
  kind: text("kind", { enum: ["admin", "user"] }).notNull().default("user"),
  status: text("status", { enum: ["active", "paused", "blocked", "banned"] }).notNull().default("active"),
  maxDevices: integer("max_devices").notNull().default(1),
  features: jsonb("features").$type<string[]>().notNull().default(sql`'["edge"]'::jsonb`),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessKeySessionsTable = pgTable("access_key_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  accessKeyId: uuid("access_key_id").notNull().references(() => accessKeysTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  deviceHash: text("device_hash").notNull(),
  userAgent: text("user_agent"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const insertAccessKeySchema = createInsertSchema(accessKeysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccessKey = z.infer<typeof insertAccessKeySchema>;
export type AccessKey = typeof accessKeysTable.$inferSelect;
export type AccessKeySession = typeof accessKeySessionsTable.$inferSelect;