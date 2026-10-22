/**
 * Integration tests run in parallel files, so each gets its own database,
 * created fresh from PG_TEST_URL (which must point at a disposable server).
 */
import path from "node:path";
import { Client } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPgDatabase, type PgDatabase } from "@/db/postgres/client";

export const PG_TEST_URL = process.env.PG_TEST_URL;

/** A migrated, empty database named `name` on the PG_TEST_URL server. */
export async function freshDatabase(name: string): Promise<{ url: string; db: PgDatabase }> {
  if (!PG_TEST_URL) throw new Error("PG_TEST_URL is not set");
  const admin = new Client({ connectionString: PG_TEST_URL });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(PG_TEST_URL);
  url.pathname = `/${name}`;
  const db = createPgDatabase(url.toString());
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../db/postgres/migrations") });
  return { url: url.toString(), db };
}
