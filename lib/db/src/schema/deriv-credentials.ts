import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const derivCredentialsTable = pgTable("deriv_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  encryptedPat: text("encrypted_pat").notNull(),
  expiresAt: text("expires_at"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDerivCredentialsSchema = createInsertSchema(derivCredentialsTable);
export type InsertDerivCredentials = z.infer<typeof insertDerivCredentialsSchema>;
export type DerivCredentials = typeof derivCredentialsTable.$inferSelect;