import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const configuredPoolSize = Number(process.env.DB_POOL_MAX ?? 20);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep this configurable per API instance so horizontal scaling does not
  // multiply an unsafe connection count against the database.
  max: Number.isFinite(configuredPoolSize) ? Math.max(5, Math.min(100, configuredPoolSize)) : 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  maxUses: 7_500,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
