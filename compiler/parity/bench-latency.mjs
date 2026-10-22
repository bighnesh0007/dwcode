#!/usr/bin/env node
/**
 * Latency baseline for a DataWeave compiler endpoint (Phase 0, OPS-07).
 *
 *     node compiler/parity/bench-latency.mjs [--url <base>] [--n 30]
 *
 * Records two things separately, because they have different causes:
 *  - FIRST: the very first request, which pays any cold start (Render free tier
 *    sleeps after 15 min idle). Run this after the upstream has been idle to
 *    capture a true cold number.
 *  - WARM: N sequential requests afterwards, reported as p50 / p95 / max.
 *
 * `value` is sent as a JSON string, the way server/ does
 * (dataweave.client.ts): the upstream parses it, and a raw array or object is
 * coerced to text first ("1,2,3", "[object Object]") and fails.
 *
 * Read-only: it only sends a fixed trivial script. The replacement runtime must
 * beat these numbers before the switch-over flag is flipped (Phase 2).
 */
import { performance } from "node:perf_hooks";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const BASE = arg("url", process.env.DWL_BACKEND_URL || "https://dataweave-playground-h1p7.onrender.com").replace(/\/$/, "");
const N = Number(arg("n", "30"));
const SCRIPT = "%dw 2.0\noutput application/json\n---\npayload map ($ * 2)";
const INPUT = [1, 2, 3];

async function once() {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/transform`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script: SCRIPT, inputs: [{ name: "payload", value: JSON.stringify(INPUT), mimeType: "application/json" }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json();
  const ms = performance.now() - t0;
  const out = body.output ?? body.result;
  // A fast wrong answer is not a baseline — check the result, not just the status.
  const ok = res.ok && JSON.stringify(typeof out === "string" ? JSON.parse(out) : out) === "[2,4,6]";
  return { ms, ok, status: res.status };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const first = await once();
const warm = [];
let failures = first.ok ? 0 : 1;
for (let i = 0; i < N; i++) {
  const r = await once();
  if (!r.ok) failures++;
  warm.push(r.ms);
}
warm.sort((a, b) => a - b);

const report = {
  url: BASE,
  at: new Date().toISOString(),
  firstMs: Math.round(first.ms),
  warm: { n: N, p50: Math.round(pct(warm, 50)), p95: Math.round(pct(warm, 95)), max: Math.round(warm.at(-1)) },
  failures,
};
console.log(JSON.stringify(report, null, 2));
process.exit(failures ? 1 : 0);
