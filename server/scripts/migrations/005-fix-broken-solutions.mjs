#!/usr/bin/env node
/**
 * 005 — Replace official solutions that fail their own stored test cases.
 *
 *     npm -w dwcode-server run migrate:solutions -- --dry-run            # read-only
 *     npm -w dwcode-server run migrate:solutions                         # writes all verified
 *     npm -w dwcode-server run migrate:solutions -- --slugs a,b          # writes only those
 *
 * `audit:problems` found official solutions that do not compile, throw, or compute
 * something other than the stored expectations (migration 004's dry run classifies
 * them). The stored expectations were reviewed and kept; the solutions were wrong.
 * Replacements live in ./data/005-solutions.json, keyed by slug.
 *
 * SAFETY
 *  - Only `solution` is changed. Expectations are never touched (CLAUDE.md).
 *  - Every replacement is run through the real compiler against every example,
 *    test case and hidden test case first. A replacement that fails ANY case is
 *    not written; the run continues with the others and exits non-zero.
 *  - The old solution is copied to `problems_solution_backup` before writing.
 *  - The update is conditional on `solution` being unchanged since it was read.
 *  - Idempotent: a problem already carrying its replacement is skipped.
 *  - Additive: no schema change, no deploy ordering.
 */
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import { COMPILER_URL, casesOf, checkCases } from "../lib/compiler.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const slugArg = process.argv.indexOf("--slugs");
const ONLY = slugArg > -1 ? new Set(process.argv[slugArg + 1].split(",").map((s) => s.trim())) : null;
const REPLACEMENTS = JSON.parse(readFileSync(new URL("./data/005-solutions.json", import.meta.url), "utf8"));

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (server/.env).");
  const host = process.env.MONGODB_URI.replace(/\/\/[^@]*@/, "//<credentials>@").split("?")[0];
  console.log(`${DRY_RUN ? "DRY RUN" : "LIVE RUN"} against ${host}\nCompiler: ${COMPILER_URL}\n`);

  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const db = mongoose.connection.db;
  const counts = { replaced: 0, wouldReplace: 0, alreadyDone: 0, failed: 0, missing: 0 };

  for (const [slug, solution] of Object.entries(REPLACEMENTS)) {
    if (ONLY && !ONLY.has(slug)) continue;
    const problem = await db.collection("problems").findOne({ slug });
    if (!problem) {
      counts.missing++;
      console.log(`MISSING   ${slug}`);
      continue;
    }
    if (problem.solution === solution) {
      counts.alreadyDone++;
      console.log(`DONE      ${slug}`);
      continue;
    }

    const results = await checkCases(solution, casesOf(problem));
    const failures = results.filter((r) => !r.passed);
    if (results.length === 0 || failures.length > 0) {
      counts.failed++;
      console.log(`FAIL      ${slug} ${results.length - failures.length}/${results.length} — not writing`);
      for (const f of failures) console.log(`    ${f.label}\n      expected ${f.expected}\n      got      ${f.actual}`);
      continue;
    }

    if (DRY_RUN) {
      counts.wouldReplace++;
      console.log(`WOULD FIX ${slug} ${results.length}/${results.length}`);
      continue;
    }
    await db.collection("problems_solution_backup").insertOne({
      problemId: problem._id,
      slug,
      migration: "005",
      backedUpAt: new Date(),
      solution: problem.solution,
    });
    const res = await db.collection("problems").updateOne(
      { _id: problem._id, solution: problem.solution },
      { $set: { solution } },
    );
    if (res.modifiedCount === 1) {
      counts.replaced++;
      console.log(`FIXED     ${slug} ${results.length}/${results.length}`);
    } else {
      counts.failed++;
      console.log(`CHANGED   ${slug} — document changed since read, not written; re-run`);
    }
  }

  console.log(`\n${JSON.stringify(counts)}`);
  if (counts.failed > 0 || counts.missing > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`\nAborted: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
