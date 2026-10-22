#!/usr/bin/env node
/**
 * Capture the golden parity corpus from the CURRENT compiler (Phase 0, OPS-07).
 *
 *     node --env-file=client/.env.local compiler/parity/capture-corpus.mjs
 *
 * For every problem with an official solution, runs it against every case and
 * records what the current runtime actually outputs. The replacement runtime must
 * reproduce these outputs exactly. Outputs are generated, never hand-written
 * (CLAUDE.md) — a hand-written expectation would test our typing, not the engine.
 *
 * Also records whether each output matches the stored expectation, so known-bad
 * problem data (issue #9) is not mistaken for a runtime regression later.
 *
 * READ-ONLY against MONGODB_URI (production): autoIndex off, find() only.
 *
 * The output contains HIDDEN test cases, so it is gitignored and must never be
 * committed — the repository is public.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { COMPILER_URL, casesOf, formatCompilerOutput, normalizeOutput } from "../../client/scripts/lib/compiler.mjs";

/**
 * Sends `value` as a JSON string, exactly as server/ does (dataweave.client.ts).
 * Not lib/compiler.mjs's runScript: that sends a parsed object, which the
 * upstream coerces to "[object Object]" — the corpus would record that failure.
 */
async function runScript(script, input) {
  const response = await fetch(`${COMPILER_URL}/api/transform`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, inputs: [{ name: "payload", value: input || "{}", mimeType: "application/json" }] }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(String(data.error || data.message || `HTTP ${response.status}`));
  return formatCompilerOutput(data.output ?? data.result, script);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "corpus.json");

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (client/.env.local).");
const host = process.env.MONGODB_URI.replace(/\/\/[^@]*@/, "//<credentials>@").split("?")[0];
console.log(`READ-ONLY capture from ${host}\nCompiler: ${COMPILER_URL}\n`);

await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
const problems = await mongoose.connection.db
  .collection("problems")
  .find({ solution: { $exists: true, $ne: "" } }, { projection: { slug: 1, solution: 1, examples: 1, testCases: 1, hiddenTestCases: 1 } })
  .sort({ slug: 1 })
  .toArray();
await mongoose.disconnect();

const entries = [];
let errors = 0;
let mismatches = 0;
for (const p of problems) {
  for (const c of casesOf(p)) {
    let output = null;
    let error = null;
    try {
      output = await runScript(p.solution, c.input);
    } catch (err) {
      error = err.message;
      errors++;
    }
    const matchesStored = output !== null && normalizeOutput(output) === normalizeOutput(c.expected ?? "");
    if (output !== null && !matchesStored) mismatches++;
    entries.push({ slug: p.slug, case: c.label, kind: c.kind, script: p.solution, input: c.input, output, error, matchesStored });
  }
  process.stdout.write(".");
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ compiler: COMPILER_URL, capturedAt: new Date().toISOString(), entries }, null, 2));
console.log(`\n\n${problems.length} problems, ${entries.length} cases → ${OUT}`);
console.log(`runtime errors: ${errors}   output ≠ stored expectation: ${mismatches}`);
