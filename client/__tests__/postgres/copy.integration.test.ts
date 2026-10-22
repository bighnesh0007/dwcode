/**
 * Applies the migrations and the copy to a real PostgreSQL.
 * Runs only when PG_TEST_URL points at a disposable database — it drops the
 * public schema first.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { createPgDatabase, type PgDatabase } from "@/db/postgres/client";
import { applyPlan, buildPlan, countRows } from "@/db/postgres/copy";
import { readFixtures } from "./fixtures";

const url = process.env.PG_TEST_URL;

describe.skipIf(!url)("copy into PostgreSQL (#23)", () => {
  let db: PgDatabase;

  beforeAll(async () => {
    db = createPgDatabase(url);
    await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`);
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../db/postgres/migrations") });
  });
  afterAll(() => db?.close());

  it("copies every planned row, and a second run converges", async () => {
    const plan = await buildPlan(readFixtures);
    await applyPlan(db, plan);
    await applyPlan(db, plan);
    const counts = await countRows(db, plan);
    for (const t of plan.tables) expect([t.name, counts.get(t.name)]).toEqual([t.name, t.rows.length]);
  });

  it("enforces one open report per user per problem", async () => {
    const plan = await buildPlan(readFixtures);
    const report = plan.tables.find((t) => t.name === "problem_reports")?.rows[0];
    if (!report) throw new Error("fixture has no problem report");
    await expect(
      db.execute(sql`insert into problem_reports (id, problem_id, user_id, reason)
        values ('x', ${report.problemId}, ${report.userId}, ${report.reason})`),
    ).rejects.toThrow();
  });

  it("rejects a self-follow", async () => {
    await expect(
      db.execute(sql`insert into follows (follower_id, followed_id) values ('u9', 'u9')`),
    ).rejects.toThrow();
  });
});
