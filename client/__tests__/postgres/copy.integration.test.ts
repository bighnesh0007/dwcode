/**
 * Applies the migrations and the copy to a real PostgreSQL.
 * Runs only when PG_TEST_URL points at a disposable server — it creates and
 * drops its own database there.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "@/db/postgres/client";
import { applyPlan, buildPlan, countRows, verifyPlan } from "@/db/postgres/copy";
import { readFixtures } from "./fixtures";
import { PG_TEST_URL, freshDatabase } from "./helpers";

describe.skipIf(!PG_TEST_URL)("copy into PostgreSQL (#23)", () => {
  let db: PgDatabase;

  beforeAll(async () => {
    ({ db } = await freshDatabase("dwcode_test_copy"));
  });
  afterAll(() => db?.close());

  it("copies every planned row, and a second run converges", async () => {
    const plan = await buildPlan(readFixtures);
    await applyPlan(db, plan);
    await applyPlan(db, plan);
    const counts = await countRows(db, plan);
    for (const t of plan.tables) expect([t.name, counts.get(t.name)]).toEqual([t.name, t.rows.length]);
  });

  it("verifies every copied row by checksum, and catches a changed row", async () => {
    const plan = await buildPlan(readFixtures);
    for (const v of await verifyPlan(db, plan)) {
      expect([v.name, v.missing, v.different, v.checksumPostgres]).toEqual([v.name, 0, 0, v.checksumCopied]);
    }
    await db.execute(sql`update problems set title = 'tampered' where slug = 'two'`);
    const problems = (await verifyPlan(db, plan)).find((v) => v.name === "problems");
    expect(problems).toMatchObject({ missing: 0, different: 1 });
    expect(problems?.checksumPostgres).not.toBe(problems?.checksumCopied);
    await applyPlan(db, plan);
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
