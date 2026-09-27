import { boolean, integer, pgTable, timestamp } from "drizzle-orm/pg-core";

export const tradingProtectionSettingsTable = pgTable("trading_protection_settings", {
  id: integer("id").primaryKey().default(1),
  weekdaysEnabled: boolean("weekdays_enabled").notNull().default(false),
  weekendsEnabled: boolean("weekends_enabled").notNull().default(false),
  dualWeekendsWeekdaysEnabled: boolean("dual_weekends_weekdays_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TradingProtectionSettings = typeof tradingProtectionSettingsTable.$inferSelect;