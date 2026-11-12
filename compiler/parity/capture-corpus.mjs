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
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { casesOf, formatCompilerOutput, normalizeOutput } from "../../server/scripts/lib/compiler.mjs";

/**
 * The reference runtime, named explicitly. Deliberately NOT DWL_BACKEND_URL:
 * client/.env.local points that at a local dev server, and a corpus captured
 * from the wrong runtime is worse than none. Override with --compiler <url>.
 */
const flag = process.argv.indexOf("--compiler");
// No default: the reference upstream this was written for (Render-hosted) is
// retired. Name the reference explicitly, e.g. --compiler http://127.0.0.1:4000
if (flag < 0) throw new Error("Pass --compiler <base url> (the runtime to capture as the reference).");
const COMPILER_URL = process.argv[flag + 1].replace(/\/$/, "");

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

// An empty corpus makes every later parity check pass vacuously, so refuse it
// and say where we looked. A URI with no path silently selects the "test" db.
if (problems.length === 0) {
  const db = mongoose.connection.db;
  const total = await db.collection("problems").countDocuments();
  console.error(`No solved problems in database "${db.databaseName}" (problems collection holds ${total} documents).`);
  try {
    const { databases } = await db.admin().listDatabases({ nameOnly: true });
    for (const { name } of databases) {
      // System dbs (admin, local) can refuse the count; skip them, keep looking.
      const n = await mongoose.connection.client.db(name).collection("problems").estimatedDocumentCount().catch(() => 0);
      if (n) console.error(`  database "${name}" has ${n} problems → put it in the URI path: ...mongodb.net/${name}?...`);
    }
  } catch {
    console.error("  (this user cannot list databases — check the database name in the URI)");
  }
  await mongoose.disconnect();
  process.exit(1);
}
await mongoose.disconnect();

// Resumable: progress is saved after every problem, so an interrupted run
// (closed terminal, upstream outage) continues instead of starting over — a
// full capture against the ~5s/request upstream takes hours.
const PARTIAL = OUT + ".partial";
const entries = [];
try {
  entries.push(...JSON.parse(await readFile(PARTIAL, "utf8")).entries);
} catch {
  // no partial run to resume
}
const done = new Set(entries.map((e) => e.slug));
if (done.size) console.log(`resuming: ${done.size} problems already captured`);
await mkdir(dirname(OUT), { recursive: true });

/**
 * A transport failure is not the runtime's answer and must not enter the corpus
 * as one — it would demand the new runtime reproduce an outage. Retry it; if it
 * persists, mark it `transport` so the parity check skips it. A non-JSON body
 * (SyntaxError) is the platform's error page during a cold start or deploy.
 */
async function capture(script, input) {
  for (let attempt = 1; ; attempt++) {
    try {
      return { output: await runScript(script, input), error: null, transport: false };
    } catch (err) {
      const isTransport = err.name === "SyntaxError" || err.name === "TimeoutError" || err.name === "AbortError" || err.message === "fetch failed" || /^HTTP 5\d\d$/.test(err.message);
      if (!isTransport) return { output: null, error: err.message, transport: false };
      if (attempt === 3) return { output: null, error: err.message, transport: true };
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const CONCURRENCY = 2; // gentle: the upstream is a single free-tier instance
const todo = problems.filter((p) => !done.has(p.slug));
let next = 0;
async function lane() {
  while (next < todo.length) {
    const p = todo[next++];
    for (const c of casesOf(p)) {
      const r = await capture(p.solution, c.input);
      const matchesStored = r.output !== null && normalizeOutput(r.output) === normalizeOutput(c.expected ?? "");
      entries.push({ slug: p.slug, case: c.label, kind: c.kind, script: p.solution, input: c.input, ...r, matchesStored });
    }
    await writeFile(PARTIAL, JSON.stringify({ entries }));
    process.stdout.write(".");
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, lane));

entries.sort((a, b) => a.slug.localeCompare(b.slug) || a.case.localeCompare(b.case));
await writeFile(OUT, JSON.stringify({ compiler: COMPILER_URL, capturedAt: new Date().toISOString(), entries }, null, 2));
await rm(PARTIAL, { force: true });

const count = (f) => entries.filter(f).length;
console.log(`\n\n${problems.length} problems, ${entries.length} cases → ${OUT}`);
console.log(`runtime errors: ${count((e) => e.error && !e.transport)}   transport failures: ${count((e) => e.transport)}   output ≠ stored expectation: ${count((e) => e.output !== null && !e.matchesStored)}`);
