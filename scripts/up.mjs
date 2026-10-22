#!/usr/bin/env node
/**
 * One command for the whole stack on this machine:
 *
 *     npm run up                 build what changed, start everything, keep it running
 *     npm run up -- --rebuild    rebuild every component first
 *     npm run up -- --no-tunnel  skip the Cloudflare tunnel (local only)
 *
 * Start order follows the dependencies, and each step waits for the previous
 * one to report healthy — a server that starts before its compiler would serve
 * its first requests as outages:
 *
 *   redis     127.0.0.1:6379  rate limits, result cache, grading queue
 *   compiler  127.0.0.1:8080  DataWeave engine in warm JVM workers (compiler/)
 *   server    127.0.0.1:4000  Express API (server/)
 *   client    localhost:8000  Next.js site; proxies /backend → server
 *   tunnel    dwl.business.space → client, via cloudflared (scripts/tunnel-setup.sh)
 *
 * Everything binds to loopback. The tunnel is the only way in from outside.
 *
 * A process that exits unexpectedly is restarted with backoff; one that keeps
 * crashing (5 times in a minute) brings the stack down rather than flapping.
 * Ctrl-C stops everything in reverse order. Logs: .run/logs/<name>.log
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, readdirSync, cpSync } from "node:fs";
import { homedir, cpus, totalmem } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUN = join(ROOT, ".run");
const LOGS = join(RUN, "logs");
mkdirSync(LOGS, { recursive: true });

const args = new Set(process.argv.slice(2));
const REBUILD = args.has("--rebuild");
const TUNNEL = !args.has("--no-tunnel");
const TUNNEL_CONFIG = join(homedir(), ".cloudflared", "dwcode.yml");

const colors = { redis: 31, compiler: 33, server: 35, client: 36, tunnel: 32, up: 37 };
function say(name, line) {
  process.stdout.write(`\x1b[${colors[name] ?? 37}m${name.padEnd(8)}\x1b[0m ${line}\n`);
}
function fail(message) {
  say("up", `\x1b[31m✗ ${message}\x1b[0m`);
  process.exit(1);
}

// ── env files ─────────────────────────────────────────────────────────────────
/** Minimal dotenv: KEY=VALUE, # comments, optional quotes. No expansion. */
function readEnv(path) {
  if (!existsSync(path)) fail(`${path} is missing — see the README "Run locally" section.`);
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
const serverEnv = readEnv(join(ROOT, "server", ".env"));
const clientEnv = readEnv(join(ROOT, "client", ".env.local"));
if (!serverEnv.COMPILER_AUTH_TOKEN || serverEnv.COMPILER_AUTH_TOKEN.length < 32) {
  fail("server/.env needs COMPILER_AUTH_TOKEN (32+ chars). Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
}

// ── tools ─────────────────────────────────────────────────────────────────────
function which(cmd, extra = []) {
  for (const p of [...extra, ...(process.env.PATH ?? "").split(":")]) {
    const f = join(p, cmd);
    if (existsSync(f)) return f;
  }
  return null;
}
const JAVA_HOME = ["/usr/lib/jvm/java-21-openjdk", process.env.JAVA_HOME].find((p) => p && existsSync(join(p, "bin", "java")));
if (!JAVA_HOME) fail("JDK 21 not found (expected /usr/lib/jvm/java-21-openjdk or JAVA_HOME).");
const JAVA = join(JAVA_HOME, "bin", "java");
const REDIS = which("redis-server", [join(homedir(), ".local", "bin")]);
const CLOUDFLARED = which("cloudflared");

// ── build what changed ────────────────────────────────────────────────────────
function newestMtime(dir, skip = /node_modules|\.next|dist|target|\.run/) {
  let newest = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (skip.test(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}
const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);
const stale = (artifact, ...sources) => REBUILD || mtime(artifact) < Math.max(...sources.map((s) => newestMtime(s)));

function run(name, cmd, argv, opts = {}) {
  say(name, `$ ${cmd} ${argv.join(" ")}`);
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: "inherit", ...opts });
  if (r.status !== 0) fail(`${name} build failed`);
}

const sharedDir = join(ROOT, "packages", "shared");
if (stale(join(sharedDir, "dist", "index.js"), join(sharedDir, "src"))) run("up", "npm", ["run", "build:shared"]);

const jar = join(ROOT, "compiler", "target", "dwcode-compiler.jar");
if (stale(jar, join(ROOT, "compiler", "src")) || mtime(jar) < mtime(join(ROOT, "compiler", "pom.xml"))) {
  run("compiler", "mvn", ["-q", "-B", "package", "-DskipTests"], { cwd: join(ROOT, "compiler"), env: { ...process.env, JAVA_HOME } });
}

const serverEntry = join(ROOT, "server", "dist", "server.js");
if (stale(serverEntry, join(ROOT, "server", "src"), sharedDir + "/src")) run("server", "npm", ["run", "build:server"]);

// NEXT_PUBLIC_* values are inlined at build time, so a change to .env.local
// must rebuild the client too.
const standalone = join(ROOT, "client", ".next", "standalone", "client", "server.js");
const clientEnvMtime = mtime(join(ROOT, "client", ".env.local"));
if (REBUILD || stale(standalone, join(ROOT, "client"), sharedDir + "/src") || mtime(standalone) < clientEnvMtime) {
  run("client", "npm", ["run", "build:client"]);
  // The standalone server does not include static assets; Next documents copying them.
  cpSync(join(ROOT, "client", ".next", "static"), join(ROOT, "client", ".next", "standalone", "client", ".next", "static"), { recursive: true });
  if (existsSync(join(ROOT, "client", "public"))) {
    cpSync(join(ROOT, "client", "public"), join(ROOT, "client", ".next", "standalone", "client", "public"), { recursive: true });
  }
}

// ── processes ─────────────────────────────────────────────────────────────────
const cores = cpus().length;
// A worker is ~300 MB RSS (measured). Leave room for everything else.
const memWorkers = Math.floor((totalmem() / 2 ** 20 - 3000) / 400);
const WORKERS = String(Math.max(2, Math.min(cores - 2, memWorkers, 8)));

const services = [
  REDIS && {
    name: "redis",
    cmd: REDIS,
    argv: ["--port", "6379", "--bind", "127.0.0.1", "--protected-mode", "yes", "--dir", (mkdirSync(join(RUN, "redis"), { recursive: true }), join(RUN, "redis")),
      // Durable enough that queued submissions survive a restart; BullMQ needs noeviction.
      "--appendonly", "yes", "--maxmemory-policy", "noeviction", "--save", ""],
    health: () => probeRedis(),
  },
  {
    name: "compiler",
    cmd: JAVA,
    argv: ["-Xmx192m", "-XX:+UseSerialGC", "-XX:+ExitOnOutOfMemoryError", "-jar", jar],
    env: {
      COMPILER_HOST: "127.0.0.1", PORT: "8080", APP_ENV: "production",
      COMPILER_AUTH_TOKEN: serverEnv.COMPILER_AUTH_TOKEN, COMPILER_WORKERS: WORKERS,
    },
    // The compiler gets ONLY what it needs: it runs untrusted code.
    cleanEnv: true,
    health: () => httpOk("http://127.0.0.1:8080/ready"),
  },
  {
    name: "server",
    cmd: process.execPath,
    argv: [serverEntry],
    env: { ...serverEnv, HOST: "127.0.0.1", PORT: "4000", ...(REDIS ? {} : { REDIS_URL: "" }) },
    health: () => httpOk("http://127.0.0.1:4000/health"),
  },
  {
    name: "client",
    cmd: process.execPath,
    argv: [standalone],
    cwd: dirname(standalone),
    // "localhost", not 127.0.0.1: Next proxies some requests to itself at
    // http://localhost:<port>, which resolves to ::1 first — bound to 127.0.0.1
    // only, those self-requests were refused and every page returned 500.
    env: { ...clientEnv, PORT: "8000", HOSTNAME: "localhost", NODE_ENV: "production" },
    health: () => httpOk("http://localhost:8000/"),
  },
  TUNNEL && CLOUDFLARED && existsSync(TUNNEL_CONFIG) && {
    name: "tunnel",
    cmd: CLOUDFLARED,
    argv: ["tunnel", "--config", TUNNEL_CONFIG, "--no-autoupdate", "run"],
    health: () => Promise.resolve(true),
  },
].filter(Boolean);

if (!REDIS) say("up", "⚠ redis-server not found — limits, cache and queue fall back to process memory (correct for one machine; queued jobs are lost on restart).");
if (TUNNEL && !CLOUDFLARED) say("up", "⚠ cloudflared not installed — no tunnel.");
else if (TUNNEL && !existsSync(TUNNEL_CONFIG)) say("up", `⚠ no tunnel config at ${TUNNEL_CONFIG} — run: bash scripts/tunnel-setup.sh`);

async function httpOk(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "manual" });
    return r.status < 500;
  } catch {
    return false;
  }
}
function probeRedis() {
  const cli = join(dirname(REDIS), "redis-cli");
  if (!existsSync(cli)) return Promise.resolve(true);
  return Promise.resolve(spawnSync(cli, ["-p", "6379", "ping"], { encoding: "utf8" }).stdout?.trim() === "PONG");
}

const children = new Map();
let stopping = false;

function start(svc) {
  const log = createWriteStream(join(LOGS, `${svc.name}.log`), { flags: "a" });
  const env = svc.cleanEnv ? { PATH: "/usr/bin:/bin", ...svc.env } : { ...process.env, ...svc.env };
  const child = spawn(svc.cmd, svc.argv, { cwd: svc.cwd ?? ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  const pipe = (stream) => {
    let buf = "";
    stream.on("data", (d) => {
      log.write(d);
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        say(svc.name, buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code, signal) => {
    children.delete(svc.name);
    log.end();
    if (stopping) return;
    svc.crashes = (svc.crashes ?? []).filter((t) => Date.now() - t < 60_000).concat(Date.now());
    if (svc.crashes.length >= 5) {
      say(svc.name, `crashed ${svc.crashes.length} times in a minute — stopping the stack`);
      void shutdown(1);
      return;
    }
    const delay = 1000 * 2 ** (svc.crashes.length - 1);
    say(svc.name, `exited (${signal ?? code}); restarting in ${delay} ms`);
    setTimeout(() => !stopping && start(svc), delay);
  });
  children.set(svc.name, child);
  return child;
}

async function waitHealthy(svc, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!children.has(svc.name) && !stopping) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    if (await svc.health()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  say(svc.name, "did not become healthy in time");
  await shutdown(1);
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  say("up", "stopping…");
  for (const svc of [...services].reverse()) {
    const child = children.get(svc.name);
    if (!child) continue;
    child.kill("SIGTERM");
    await new Promise((r) => {
      const t = setTimeout(() => {
        child.kill("SIGKILL");
        r();
      }, 12_000);
      child.once("exit", () => {
        clearTimeout(t);
        r();
      });
    });
    say(svc.name, "stopped");
  }
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

// Refuse to start on top of something already listening: two copies of the
// stack would fight over ports and the health checks would lie.
for (const [name, url] of [["compiler", "http://127.0.0.1:8080/health"], ["server", "http://127.0.0.1:4000/health"], ["client", "http://localhost:8000/"]]) {
  if (await httpOk(url)) fail(`${name} port is already in use (${url}). Stop the other copy first.`);
}

for (const svc of services) {
  start(svc);
  await waitHealthy(svc);
  say(svc.name, "\x1b[32mhealthy\x1b[0m");
}

say("up", "\x1b[32m✓ all up\x1b[0m — http://localhost:8000" + (services.some((s) => s.name === "tunnel") ? "  ·  https://dwl.business.space" : ""));
say("up", "Ctrl-C to stop. Logs: .run/logs/");
