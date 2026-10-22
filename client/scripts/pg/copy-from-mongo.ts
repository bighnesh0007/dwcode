/**
 * Copy every MongoDB collection into PostgreSQL — issue #23, Phase 2.
 *
 *   npm run pg:copy               # dry run: read Mongo, map, report. Writes nothing.
 *   npm run pg:copy -- --apply    # upsert into DATABASE_URL in one transaction.
 *
 * Verification compares every copied row with its Postgres row by primary key
 * and prints row counts and checksums side by side; any mismatch exits 1.
 *
 * Repeatable: rows are upserted by primary key, so re-running after more Mongo
 * writes brings Postgres up to date without duplicates. Mongo is only read.
 *
 * Rows that cannot be represented (anonymous bookmarks, submissions for a
 * deleted problem, …) are skipped and counted by reason, never silently lost.
 */
import mongoose from "mongoose";
import { createPgDatabase } from "../../db/postgres/client";
import { applyPlan, buildPlan, verifyPlan } from "../../db/postgres/copy";

const APPLY = process.argv.includes("--apply");

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(mongoUri);
  const mongo = mongoose.connection.db;
  if (!mongo) throw new Error("MongoDB connection has no database");
  const plan = await buildPlan(
    (c) => mongo.collection(c).find().toArray(),
  ).finally(() => mongoose.disconnect());

  console.log(`\n${APPLY ? "APPLY" : "DRY RUN"} — rows per table:`);
  for (const p of plan.tables) console.log(`  ${p.name.padEnd(22)} ${p.rows.length}`);
  if (plan.skipped.size) {
    console.log("\nSkipped:");
    for (const [k, n] of plan.skipped) console.log(`  ${n.toString().padStart(6)}  ${k}`);
  }
  if (!APPLY) {
    console.log("\nNothing written. Re-run with --apply to copy into DATABASE_URL.");
    return;
  }

  const db = createPgDatabase();
  try {
    await applyPlan(db, plan);
    console.log("\nVerify — copied vs Postgres (rows, checksum over copied columns):");
    for (const v of await verifyPlan(db, plan)) {
      const ok = v.missing === 0 && v.different === 0;
      if (!ok) process.exitCode = 1;
      console.log(
        `  ${ok ? "ok  " : "BAD "} ${v.name.padEnd(22)} ${String(v.copied).padStart(7)} → ${String(v.inPostgres).padStart(7)}` +
          `  ${v.checksumCopied} ${v.checksumCopied === v.checksumPostgres ? "=" : "≠"} ${v.checksumPostgres}` +
          (ok ? "" : `  (missing ${v.missing}, different ${v.different})`),
      );
    }
  } finally {
    await db.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
