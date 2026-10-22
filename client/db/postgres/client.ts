import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type PgDatabase = ReturnType<typeof createPgDatabase>;

/** A Drizzle handle over a pooled connection to `url` (defaults to DATABASE_URL). */
export function createPgDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 5 });
  return Object.assign(drizzle(pool, { schema }), { close: () => pool.end() });
}
