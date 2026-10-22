#!/usr/bin/env node
/**
 * Production dependency audit gate.
 *
 *     node scripts/audit-gate.mjs client
 *     node scripts/audit-gate.mjs server
 *
 * Fails (exit 1) on any high or critical advisory in a workspace's production
 * tree, unless that advisory is listed in ACCEPTED below with a justification
 * and an expiry date that has not passed.
 *
 * Why not plain `npm audit --audit-level=high`? Some advisories ship bundled
 * inside a framework with no forward fix, and npm's only "fix" is a major
 * downgrade. An acceptance lets such an advisory through for a bounded time —
 * once it expires, CI fails again and forces a re-review instead of the
 * advisory being ignored forever.
 */
import { execFileSync } from "node:child_process";

const WORKSPACES = {
  client: "dwcode-client",
  server: "dwcode-server",
};

const BLOCKING = new Set(["high", "critical"]);

/**
 * Accepted advisories. Each entry needs every field:
 *
 *   { id: "GHSA-xxxx-xxxx-xxxx", package: "name", expires: "YYYY-MM-DD",
 *     reason: "why it is not reachable in this app", ref: "link or doc path" }
 *
 * Keep this list short. Prefer upgrading.
 */
const ACCEPTED = [];

const target = process.argv[2];
const workspace = WORKSPACES[target];
if (!workspace) {
  console.error(`usage: node scripts/audit-gate.mjs <${Object.keys(WORKSPACES).join("|")}>`);
  process.exit(2);
}

let raw;
try {
  raw = execFileSync(
    "npm",
    ["audit", "--json", "--omit=dev", "--workspace", workspace],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
} catch (err) {
  // npm audit exits non-zero whenever it finds anything; the JSON is still on stdout.
  raw = err.stdout;
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error(`audit-gate: could not parse npm audit output for ${target}.`);
  process.exit(1);
}
if (report.error) {
  console.error(`audit-gate: npm audit failed for ${target}: ${report.error.summary ?? report.error.code}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const accepted = new Map(ACCEPTED.map((a) => [a.id, a]));

// Collect the advisories themselves (the `via` objects), not the packages that
// merely depend on a vulnerable one — those are reported under their own name.
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
    const id = via.url?.split("/").pop() ?? String(via.source);
    advisories.set(id, { id, package: via.name, severity: via.severity, title: via.title });
  }
}

const failures = [];
for (const adv of advisories.values()) {
  const acceptance = accepted.get(adv.id);
  if (!acceptance) {
    failures.push(`${adv.severity.toUpperCase()} ${adv.package} ${adv.id} — ${adv.title}`);
  } else if (acceptance.expires < today) {
    failures.push(`EXPIRED acceptance (${acceptance.expires}) ${adv.package} ${adv.id} — re-review it`);
  } else {
    console.log(`accepted until ${acceptance.expires}: ${adv.package} ${adv.id} — ${acceptance.reason}`);
  }
}

if (failures.length > 0) {
  console.error(`audit-gate: ${target} has ${failures.length} blocking advisory(ies):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `audit-gate: ${target} OK — no unaccepted high/critical advisories ` +
    `(low ${counts.low ?? 0}, moderate ${counts.moderate ?? 0}).`,
);
