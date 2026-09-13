import { createInsertSchema } from "drizzle-zod";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const accessKeysTable = pgTable("access_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  encryptedKey: text("encrypted_key"),
  keyPrefix: text("key_prefix").notNull(),
  label: text("label").notNull(),
  kind: text("kind", { enum: ["admin", "user"] }).notNull().default("user"),
  status: text("status", { enum: ["active", "paused", "blocked", "banned", "deleted"] }).notNull().default("active"),
  maxDevices: integer("max_devices").notNull().default(1),
  features: jsonb("features").$type<string[]>().notNull().default(sql`'["edge"]'::jsonb`),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  labelIndex: index("access_keys_label_idx").on(table.label),
  keyHashLookup: index("access_keys_key_hash_idx").on(table.keyHash),
}));

export const accessKeySessionsTable = pgTable("access_key_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  accessKeyId: uuid("access_key_id").notNull().references(() => accessKeysTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  deviceHash: text("device_hash").notNull(),
  userAgent: text("user_agent"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => ({
  tokenLookup: index("access_key_sessions_token_revoked_idx").on(table.tokenHash, table.revokedAt),
  accessKeySessionLookup: index("access_key_sessions_key_revoked_idx").on(table.accessKeyId, table.revokedAt),
  deviceLookup: index("access_key_sessions_key_device_revoked_idx").on(table.accessKeyId, table.deviceHash, table.revokedAt),
  presenceLookup: index("access_key_sessions_key_last_seen_idx").on(table.accessKeyId, table.lastSeenAt),
}));

export const insertAccessKeySchema = createInsertSchema(accessKeysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccessKey = z.infer<typeof insertAccessKeySchema>;
export type AccessKey = typeof accessKeysTable.$inferSelect;
export type AccessKeySession = typeof accessKeySessionsTable.$inferSelect;