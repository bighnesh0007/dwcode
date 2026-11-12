#!/usr/bin/env node
/**
 * Load test for the compiler service (Compiler Capacity Plan).
 *
 *     node compiler/parity/load-test.mjs --url http://localhost:8080 [--token …]
 *         [--users 500] [--seconds 60] [--think-ms 3000] [--unique 0.5] [--burst 2500]
 *
 * Two phases, matching the two load shapes in the plan:
 *
 *   live   `users` virtual users, each compiling once per `think-ms` (the
 *          playground's live-compile debounce) for `seconds`. `unique` is the
 *          share of requests made unique so they miss the compile cache —
 *          users typing produce new scripts, re-runs produce repeats.
 *   burst  `burst` requests fired at once: a contest start, every participant
 *          submitting with ~5 cases each.
 *
 * Scripts are real problem solutions and inputs from the parity corpus, so the
 * work per request is representative rather than a trivial `1 + 1`.
 *
 * Pass criteria (from the plan): live p95 < 1000 ms, no 5xx other than an
 * honest 503 OVERLOADED, burst fully answered.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg("url", "http://localhost:8080").replace(/\/$/, "");
const TOKEN = arg("token", process.env.COMPILER_AUTH_TOKEN ?? "");
const USERS = Number(arg("users", "500"));
const SECONDS = Number(arg("seconds", "60"));
const THINK_MS = Number(arg("think-ms", "3000"));
const UNIQUE = Number(arg("unique", "0.5"));
const BURST = Number(arg("burst", "2500"));
// --site http://localhost:8000 drives the FULL public path instead: Next.js
// /backend proxy → Express (rate limits, Redis cache) → compiler. Each virtual
// user sends its own X-Forwarded-For, as users behind Cloudflare do, so the
// per-IP limits apply per user rather than to one shared address.
const SITE = arg("site", "");

const here = dirname(fileURLToPath(import.meta.url));
const corpusPath = [join(here, "out", "corpus.json"), join(here, "out", "corpus.json.partial")].find(existsSync);
if (!corpusPath) throw new Error("No corpus found: run capture-corpus.mjs first.");
const work = JSON.parse(await readFile(corpusPath, "utf8")).entries.filter((e) => e.output !== null);
if (!work.length) throw new Error("Corpus has no successful cases to replay.");

let vuSeq = 0;
async function call(unique, vu = 0) {
  const e = work[Math.floor(Math.random() * work.length)];
  const script = unique ? `${e.script}\n// ${Math.random()}` : e.script;
  const input = { name: "payload", value: e.input || "{}", mimeType: "application/json" };
  const t0 = performance.now();
  try {
    if (SITE) {
      const res = await fetch(`${SITE.replace(/\/$/, "")}/backend/api/v1/compiler/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${vu & 255}` },
        body: JSON.stringify({ script, inputs: [input] }),
      });
      const body = await res.json();
      return { ms: performance.now() - t0, status: res.status, ok: body.data?.ok === true, kind: body.data?.error?.kind ?? body.error?.code };
    }
    const res = await fetch(`${BASE}/v1/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
      body: JSON.stringify({ script, inputs: [input] }),
    });
    const body = await res.json();
    return { ms: performance.now() - t0, status: res.status, ok: body.ok === true, kind: body.error?.kind };
  } catch (err) {
    return { ms: performance.now() - t0, status: 0, ok: false, kind: `NETWORK:${err.cause?.code ?? err.message}` };
  }
}

function summarise(name, results, wallMs) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => Math.round(ms[Math.min(ms.length - 1, Math.ceil(q * ms.length) - 1)] ?? 0);
  const kinds = {};
  for (const r of results) {
    const k = r.ok ? "ok" : `${r.status}:${r.kind}`;
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  return {
    phase: name,
    requests: results.length,
    throughputPerSec: Math.round((results.length / wallMs) * 1000),
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    max: Math.round(ms.at(-1) ?? 0),
    outcomes: kinds,
  };
}

// ── live ──────────────────────────────────────────────────────────────────────
const live = [];
const liveStart = performance.now();
const liveEnd = Date.now() + SECONDS * 1000;
await Promise.all(
  Array.from({ length: USERS }, async () => {
    const vu = ++vuSeq;
    // Stagger start so 500 users do not all fire at t=0.
    await new Promise((r) => setTimeout(r, Math.random() * THINK_MS));
    while (Date.now() < liveEnd) {
      live.push(await call(Math.random() < UNIQUE, vu));
      await new Promise((r) => setTimeout(r, THINK_MS * (0.75 + Math.random() * 0.5)));
    }
  }),
);
const liveReport = summarise("live", live, performance.now() - liveStart);

// ── burst ─────────────────────────────────────────────────────────────────────
const burstStart = performance.now();
const burst = await Promise.all(Array.from({ length: BURST }, (_, i) => call(Math.random() < UNIQUE, 100_000 + i)));
const burstReport = summarise("burst", burst, performance.now() - burstStart);
burstReport.drainMs = Math.round(performance.now() - burstStart);

const report = { url: SITE || BASE, at: new Date().toISOString(), corpusCases: work.length, users: USERS, thinkMs: THINK_MS, unique: UNIQUE, live: liveReport, burst: burstReport };
console.log(JSON.stringify(report, null, 2));

// Honest refusals are not failures: OVERLOADED from the compiler, and a 503
// COMPILER_UNAVAILABLE (the same refusal, passed through the API).
const unexpected = [...live, ...burst].filter(
  (r) => !r.ok && r.status !== 200 && r.kind !== "OVERLOADED" && r.kind !== "COMPILER_UNAVAILABLE",
);
const passed = liveReport.p95 < 1000 && unexpected.length === 0;
console.log(passed ? "\nLOAD TEST PASSED" : `\nLOAD TEST FAILED (live p95 ${liveReport.p95} ms, ${unexpected.length} unexpected failures)`);
process.exit(passed ? 0 : 1);
