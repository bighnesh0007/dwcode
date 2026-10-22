#!/usr/bin/env node
/**
 * Read-only audit of every problem's test data.
 *
 *     npm --prefix client run audit:problems                    # all problems
 *     npm --prefix client run audit:problems -- --slug <slug>   # one problem
 *
 * Runs each problem's official `solution` through the compiler against all of
 * its examples, visible test cases and hidden test cases, and reports:
 *
 *  - MISMATCH: the official solution does not produce a stored expectation.
 *    Either the expectation or the solution is wrong, and users submitting a
 *    correct answer can be marked wrong (issue #9 is this shape).
 *  - CHEATABLE: fewer than two graded cases, or no hidden cases. Visible cases
 *    reach the browser with their expected outputs, so with no hidden case,
 *    printing the expected output passes (issue #10).
 *  - NO SOLUTION: nothing to verify the expectations against.
 *
 * Exits 1 when any MISMATCH is found. GRADE_HIDDEN_TESTS should stay off until
 * this exits 0, because a wrong hidden expectation makes a problem unpassable.
 *
 * Never writes. Fix data with a migration — and generate expectations by running
 * a solution, never by hand (CLAUDE.md).
 */
import mongoose from "mongoose";
import { COMPILER_URL, casesOf, checkCases } from "./lib/compiler.mjs";

const slugArg = process.argv.indexOf("--slug");
const ONLY_SLUG = slugArg > -1 ? process.argv[slugArg + 1] : null;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (client/.env.local).");
  const host = process.env.MONGODB_URI.replace(/\/\/[^@]*@/, "//<credentials>@").split("?")[0];
  console.log(`READ-ONLY audit against ${host}\nCompiler: ${COMPILER_URL}\n`);

  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const problems = await mongoose.connection.db
    .collection("problems")
    .find(ONLY_SLUG ? { slug: ONLY_SLUG } : {})
    .sort({ slug: 1 })
    .toArray();
  if (ONLY_SLUG && problems.length === 0) throw new Error(`No problem with slug "${ONLY_SLUG}".`);

  const mismatched = [];
  const cheatable = [];
  const unsolved = [];

  for (const problem of problems) {
    const visible = problem.testCases?.length ?? 0;
    const hidden = problem.hiddenTestCases?.length ?? 0;
    if (visible + hidden < 2 || hidden === 0) {
      cheatable.push(`${problem.slug} (visible ${visible}, hidden ${hidden})`);
    }

    if (!problem.solution?.trim()) {
      unsolved.push(problem.slug);
      continue;
    }

    const failures = (await checkCases(problem.solution, casesOf(problem))).filter((r) => !r.passed);
    if (failures.length === 0) {
      console.log(`ok        ${problem.slug}`);
      continue;
    }
    mismatched.push(problem.slug);
    console.log(`MISMATCH  ${problem.slug} — ${problem.title}`);
    for (const f of failures) {
      console.log(`    ${f.label}\n      input    ${f.input}\n      expected ${f.expected}\n      solution ${f.actual}`);
    }
  }

  console.log(`\n${problems.length} problems audited.`);
  console.log(`\nMISMATCH (${mismatched.length}) — official solution disagrees with a stored expectation:`);
  for (const s of mismatched) console.log(`  - ${s}`);
  console.log(`\nCHEATABLE (${cheatable.length}) — fewer than 2 graded cases, or no hidden cases:`);
  for (const s of cheatable) console.log(`  - ${s}`);
  console.log(`\nNO SOLUTION (${unsolved.length}):`);
  for (const s of unsolved) console.log(`  - ${s}`);

  if (mismatched.length > 0) {
    console.log("\nKeep GRADE_HIDDEN_TESTS off until every MISMATCH is resolved.");
    process.exitCode = 1;
  } else if (!ONLY_SLUG) {
    console.log("\nNo mismatches: hidden cases are safe to grade (GRADE_HIDDEN_TESTS=true).");
  }
}

main()
  .catch((err) => {
    console.error(`\nAborted: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
