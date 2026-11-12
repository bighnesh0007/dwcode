#!/usr/bin/env node
/**
 * Replay the captured corpus against a compiler service and compare (Phase 1 gate).
 *
 *     node compiler/parity/check-parity.mjs [--url http://localhost:8080] [--token …] [--verbose]
 *
 * Compares what the new runtime outputs with what the reference runtime output
 * (corpus.json, captured by capture-corpus.mjs) — NOT with the stored
 * expectations. Parity means "users see what they saw before", including where
 * the stored data is wrong; fixing bad data is a separate migration.
 *
 * Categories:
 *   match        same normalised output, or both failed
 *   mismatch     both succeeded, outputs differ            → gate fails
 *   regression   reference succeeded, new runtime failed    → gate fails
 *   improvement  reference failed, new runtime succeeded    → reported (e.g. `then`)
 *   skipped      reference hit a transport failure, so it has no answer
 *
 * Exits 1 on any mismatch or regression, and on an empty corpus — a parity check
 * over nothing would pass vacuously.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCompilerOutput, normalizeOutput } from "../../server/scripts/lib/compiler.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const URL_BASE = arg("url", "http://localhost:8080").replace(/\/$/, "");
const TOKEN = arg("token", process.env.COMPILER_AUTH_TOKEN ?? "");
const VERBOSE = process.argv.includes("--verbose");
const CORPUS = arg("corpus", join(dirname(fileURLToPath(import.meta.url)), "out", "corpus.json"));
const CONCURRENCY = 8;

const { entries, compiler: reference, capturedAt } = JSON.parse(await readFile(CORPUS, "utf8"));
if (!entries?.length) {
  console.error(`Corpus ${CORPUS} is empty — refusing to report parity over nothing.`);
  process.exit(1);
}

async function execute(script, input) {
  const res = await fetch(`${URL_BASE}/v1/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ script, inputs: [{ name: "payload", value: input || "{}", mimeType: "application/json" }] }),
  });
  const body = await res.json();
  if (res.status === 503) throw new Error(`compiler unavailable: ${body.error?.kind}`);
  return body;
}

const results = { match: [], mismatch: [], regression: [], improvement: [], skipped: [] };
let next = 0;
async function lane() {
  while (next < entries.length) {
    const e = entries[next++];
    if (e.transport) {
      results.skipped.push(e);
      continue;
    }
    const r = await execute(e.script, e.input);
    const actual = r.ok ? formatCompilerOutput(r.output, e.script) : null;
    const refOk = e.output !== null;
    let bucket;
    if (refOk && r.ok) bucket = normalizeOutput(actual) === normalizeOutput(e.output) ? "match" : "mismatch";
    else if (refOk) bucket = "regression";
    else if (r.ok) bucket = "improvement";
    else bucket = "match";
    results[bucket].push({ ...e, actual, newError: r.error });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, lane));

const label = (e) => `${e.slug} · ${e.case}`;
console.log(`Reference: ${reference} (captured ${capturedAt})\nCandidate: ${URL_BASE}\n`);
for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(12)} ${v.length}`);

for (const e of results.regression) {
  console.log(`\nREGRESSION ${label(e)}\n  reference: ${String(e.output).slice(0, 200)}\n  new error: ${e.newError?.kind} ${String(e.newError?.message).split("\n")[0]}`);
}
for (const e of results.mismatch) {
  console.log(`\nMISMATCH ${label(e)}\n  reference: ${String(e.output).replace(/\s+/g, " ").slice(0, 200)}\n  new:       ${String(e.actual).replace(/\s+/g, " ").slice(0, 200)}`);
}
if (VERBOSE) {
  for (const e of results.improvement) {
    console.log(`\nIMPROVEMENT ${label(e)}\n  reference error: ${String(e.error).split("\n")[0]}`);
  }
}

const failed = results.mismatch.length + results.regression.length;
console.log(failed ? `\nPARITY FAILED: ${failed} case(s).` : "\nPARITY OK.");
process.exit(failed ? 1 : 0);
