#!/usr/bin/env node
/**
 * 003 — Replace the broken official solution of "Check If a Number Is Odd or Even".
 *
 *     npm --prefix client run migrate:odd-even -- --dry-run   # read-only
 *     npm --prefix client run migrate:odd-even                # writes
 *
 * Issue #54. The stored solution fails to compile twice over:
 *  - `type` is a reserved word, so an unquoted `type:` key is a CompilationException;
 *  - `mod` is an infix function call, which binds LOOSER than `==`, so
 *    `n mod 2 == 0` is `n mod (2 == 0)` and passes a Boolean to `mod`.
 *
 * SAFETY
 *  - Only `solution` is changed. Test cases and expected outputs are untouched —
 *    they are never hand-written (see CLAUDE.md).
 *  - The replacement is run through the real compiler against every example,
 *    test case and hidden test case first. If ANY result differs from the stored
 *    expectation, nothing is written and the script exits non-zero.
 *  - Idempotent: a problem already carrying the new solution is skipped.
 *  - Additive and backwards compatible: no schema change, no deploy ordering.
 *
 * The dry run also lists other problems whose solutions show either pattern, for
 * review. It never edits them.
 */
import mongoose from "mongoose";
import { COMPILER_URL, casesOf, checkCases } from "../lib/compiler.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const TITLE = /^check if a number is odd or even$/i;
const NEW_SOLUTION = `%dw 2.0
output application/json
---
{
  number: payload.number,
  "type": if (isOdd(payload.number)) "Odd" else "Even"
}`;

/** Heuristic flags for the two defects in #54, used only for the review list. */
function suspectPatterns(solution = "") {
  const body = solution.split(/^---\s*$/m).slice(1).join("---");
  const flags = [];
  if (/\bmod\s+[^()\s]+\s*[=!]=/.test(body)) flags.push("unparenthesised `mod` before a comparison");
  if (/(?:^|[{,])\s*(?:type|ns|var|fun|import|output|input|do|using|match|case)\s*:/m.test(body)) {
    flags.push("unquoted reserved-word key");
  }
  return flags;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (client/.env.local).");
  const host = process.env.MONGODB_URI.replace(/\/\/[^@]*@/, "//<credentials>@").split("?")[0];
  console.log(`${DRY_RUN ? "DRY RUN" : "LIVE RUN"} against ${host}`);
  console.log(`Compiler: ${COMPILER_URL}\n`);

  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const problems = mongoose.connection.db.collection("problems");

  const matches = await problems.find({ title: TITLE }).toArray();
  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 problem titled "Check If a Number Is Odd or Even", found ${matches.length}.`);
  }
  const problem = matches[0];
  console.log(`Problem: ${problem.title} (${problem.slug}, _id ${problem._id})`);

  if (problem.solution === NEW_SOLUTION) {
    console.log("Already carries the corrected solution — nothing to do.");
  } else {
    const cases = casesOf(problem);
    if (cases.length === 0) throw new Error("Problem has no examples or test cases to verify against.");

    const results = await checkCases(NEW_SOLUTION, cases);
    const failures = results.filter((r) => !r.passed).length;
    for (const r of results) {
      console.log(`  ${r.passed ? "PASS" : "FAIL"} ${r.label}${r.passed ? "" : `\n       expected ${r.expected}\n       got      ${r.actual}`}`);
    }

    if (failures > 0) {
      throw new Error(`${failures}/${cases.length} cases fail with the new solution — not writing. Check the stored expectations.`);
    }
    console.log(`\nAll ${cases.length} cases pass.`);
    console.log("Old solution:\n" + (problem.solution ?? "<none>") + "\n");

    if (DRY_RUN) {
      console.log("Would replace `solution` on this problem.");
    } else {
      const res = await problems.updateOne(
        { _id: problem._id, solution: problem.solution },
        { $set: { solution: NEW_SOLUTION } },
      );
      console.log(res.modifiedCount === 1 ? "Solution updated." : "No change written (document changed concurrently — re-run).");
    }
  }

  // Review list only — never edited by this script.
  const others = await problems.find({ _id: { $ne: problem._id } }, { projection: { title: 1, slug: 1, solution: 1 } }).toArray();
  const suspects = others
    .map((p) => ({ p, flags: suspectPatterns(p.solution) }))
    .filter((s) => s.flags.length > 0);
  console.log(`\nOther solutions to review (${suspects.length}):`);
  for (const { p, flags } of suspects) console.log(`  - ${p.slug}: ${flags.join("; ")}`);
}

main()
  .catch((err) => {
    console.error(`\nAborted: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
