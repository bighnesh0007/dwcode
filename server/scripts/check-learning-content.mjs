/**
 * Checks the learning content in src/content/ (SFCode parity, Phase D).
 *
 *   npm -w dwcode-server run check:learning            structure only
 *   COMPILER_SERVICE_URL=… npm -w dwcode-server run check:learning -- --run
 *
 * Structure: unique ids, 2–6 options, the answer index in range, sections that
 * exist. With --run, every question carrying a `check` block has its script run
 * on the compiler and the result compared with `check.expected`, so a code
 * question can never claim an answer DataWeave does not give.
 */
import { readFileSync } from "node:fs";
import { normalizeOutput, runScript } from "./lib/compiler.mjs";

const dir = new URL("../src/content/", import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
const header = "%dw 2.0\noutput application/json\n---\n";

const problems = [];
const ids = new Set();
const questions = [];

function checkQuestion(q, where) {
  if (!q.id || ids.has(q.id)) problems.push(`${where}: missing or duplicate id ${q.id}`);
  ids.add(q.id);
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) problems.push(`${q.id}: needs 2–6 options`);
  if (new Set(q.options).size !== q.options.length) problems.push(`${q.id}: duplicate options`);
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) problems.push(`${q.id}: answer out of range`);
  if (!q.explanation) problems.push(`${q.id}: no explanation`);
  questions.push(q);
}

const placement = load("placement.json");
for (const q of placement.questions) {
  if (![1, 2, 3].includes(q.tier)) problems.push(`${q.id}: tier must be 1–3`);
  checkQuestion(q, "placement");
}

const { roadmaps } = load("roadmaps.json");
for (const r of roadmaps) {
  const steps = new Set();
  for (const s of r.steps) {
    if (steps.has(s.id)) problems.push(`${r.id}: duplicate step ${s.id}`);
    steps.add(s.id);
    if (!(s.solveCount >= 0) || !s.categories?.length) problems.push(`${r.id}/${s.id}: needs categories and a solveCount`);
    for (const q of s.quiz) checkQuestion(q, `${r.id}/${s.id}`);
  }
}

const cert = load("certification-mcd-level-1.json");
const sections = new Set(cert.exam.sections.map((s) => s.id));
for (const q of cert.questions) {
  if (!sections.has(q.section)) problems.push(`${q.id}: unknown section ${q.section}`);
  checkQuestion(q, "certification");
}
for (const s of sections) {
  if (!cert.questions.some((q) => q.section === s)) problems.push(`section ${s} has no questions`);
}

if (process.argv.includes("--run")) {
  for (const q of questions.filter((x) => x.check)) {
    try {
      const out = await runScript(header + q.check.script, q.check.input ?? "{}");
      if (normalizeOutput(out) !== JSON.stringify(q.check.expected)) {
        problems.push(`${q.id}: compiler gave ${normalizeOutput(out)}, content expects ${JSON.stringify(q.check.expected)}`);
      }
    } catch (err) {
      problems.push(`${q.id}: compiler error ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

const checked = questions.filter((q) => q.check).length;
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${questions.length} questions, ${roadmaps.length} roadmaps${process.argv.includes("--run") ? `, ${checked} code answers verified on the compiler` : ""}`);
