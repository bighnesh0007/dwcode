/**
 * Client for our own compiler service (compiler/, ADR-006): POST /v1/execute.
 *
 * Retry policy (docs/audit/09-runtime-ownership.md §5):
 *   - retry ONCE, with 250ms + full jitter, only when the request never ran:
 *     connection refused/reset, or a 503 the service sent before executing
 *   - never retry a timeout (it may still be running) or any user-code result
 *     (deterministic — it would fail identically)
 * A circuit breaker sits in front: after repeated infrastructure failures
 * callers fail fast with UNAVAILABLE instead of each waiting out a timeout.
 *
 * Every outcome is returned, never thrown, so callers must decide — and the
 * type forces them to — whether a result is the user's or ours.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { CircuitBreaker } from "../../lib/circuitBreaker.ts";
import { contextLogger } from "../../lib/logger.ts";
import type { Clock, FetchLike, KeyValueStore } from "../../types/ports.ts";

export const ERROR_KINDS = [
  "COMPILE",
  "RUNTIME",
  "FORBIDDEN",
  "TIMEOUT",
  "LIMIT",
  "OVERLOADED",
  "UNAVAILABLE",
  "INVALID",
] as const;
export type CompilerErrorKind = (typeof ERROR_KINDS)[number];

/** Kinds caused by our infrastructure. Never record these as a user's verdict. */
export const INFRASTRUCTURE_KINDS: ReadonlySet<CompilerErrorKind> = new Set(["OVERLOADED", "UNAVAILABLE"]);

export interface CompilerInput {
  name: string;
  /** The input document as text; the engine parses it using `mimeType`. */
  value: string;
  mimeType: string;
}

export interface CompileRequest {
  script: string;
  inputs: CompilerInput[];
}

export type CompileResult =
  | { ok: true; output: string; mimeType: string; timeMs: number; cached: boolean }
  | { ok: false; error: { kind: CompilerErrorKind; message: string }; timeMs: number; cached: boolean };

export function isInfrastructureFailure(r: CompileResult): boolean {
  return !r.ok && INFRASTRUCTURE_KINDS.has(r.error.kind);
}

/** Validate the wire response: a malformed body is an infrastructure failure, not a verdict. */
const wireResult = z.union([
  z.object({ ok: z.literal(true), output: z.string(), mimeType: z.string(), timeMs: z.number().optional() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ kind: z.enum(ERROR_KINDS), message: z.string() }),
    timeMs: z.number().optional(),
  }),
]);

export interface CompilerServiceOptions {
  url: string;
  authToken: string;
  timeoutMs: number;
  /** Result-cache TTL. 0 disables the cache. */
  cacheTtlMs: number;
  /** Outputs larger than this are not cached: they would crowd out everything else. */
  cacheMaxOutputBytes: number;
}

/**
 * Deterministic outcomes, safe to serve from cache. TIMEOUT and LIMIT are
 * excluded: they depend on load and limits at the time, not only on the code.
 */
const CACHEABLE_FAILURES: ReadonlySet<CompilerErrorKind> = new Set(["COMPILE", "RUNTIME", "FORBIDDEN"]);

export class CompilerServiceClient {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly opts: CompilerServiceOptions,
    private readonly fetchImpl: FetchLike,
    private readonly cache: KeyValueStore,
    clock: Clock,
    private readonly random: () => number = Math.random,
  ) {
    this.breaker = new CircuitBreaker({ failureThreshold: 5, openMs: 30_000 }, clock);
  }

  get breakerState() {
    return this.breaker.state;
  }

  async execute(req: CompileRequest): Promise<CompileResult> {
    const key = this.opts.cacheTtlMs > 0 ? cacheKey(req) : undefined;
    if (key) {
      const hit = await this.cache.get<CompileResult>(key).catch(() => undefined);
      if (hit) return { ...hit, cached: true };
    }

    if (!this.breaker.tryAcquire()) {
      return unavailable("The compiler is temporarily unavailable. Retry shortly.");
    }

    let result = await this.attempt(req);
    if (result.retryable) {
      await sleep(250 + this.random() * 250);
      result = await this.attempt(req);
    }

    if (isInfrastructureFailure(result.value)) this.breaker.recordFailure();
    else this.breaker.recordSuccess();

    if (key && this.isCacheable(result.value)) {
      await this.cache.set(key, result.value, this.opts.cacheTtlMs).catch(() => undefined);
    }
    return result.value;
  }

  private isCacheable(r: CompileResult): boolean {
    if (r.ok) return Buffer.byteLength(r.output) <= this.opts.cacheMaxOutputBytes;
    return CACHEABLE_FAILURES.has(r.error.kind);
  }

  private async attempt(req: CompileRequest): Promise<{ value: CompileResult; retryable: boolean }> {
    const log = contextLogger();
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.opts.url.replace(/\/$/, "")}/v1/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.opts.authToken}` },
        body: JSON.stringify({ script: req.script, inputs: req.inputs, timeoutMs: this.opts.timeoutMs }),
        // The compiler enforces timeoutMs itself; this outer bound only covers a
        // hung connection, so it gets headroom for the queue wait and transfer.
        signal: AbortSignal.timeout(this.opts.timeoutMs + 5_000),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        log.warn({ err }, "[compiler] request timed out");
        return { value: unavailable("The compiler did not respond in time."), retryable: false };
      }
      log.warn({ err }, "[compiler] unreachable");
      return { value: unavailable("The compiler is unreachable. Retry shortly."), retryable: true };
    }

    if (response.status === 401) {
      // Misconfiguration on our side, never the user's.
      log.error("[compiler] rejected our auth token — check COMPILER_AUTH_TOKEN on both services");
      return { value: unavailable("The compiler is misconfigured."), retryable: false };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { value: unavailable(`The compiler returned an unreadable response (HTTP ${response.status}).`), retryable: response.status >= 502 };
    }
    const parsed = wireResult.safeParse(body);
    if (!parsed.success) {
      log.error({ status: response.status }, "[compiler] response did not match the contract");
      return { value: unavailable("The compiler returned an unexpected response."), retryable: false };
    }

    const timeMs = parsed.data.timeMs ?? 0;
    if (parsed.data.ok) {
      return { value: { ok: true, output: parsed.data.output, mimeType: parsed.data.mimeType, timeMs, cached: false }, retryable: false };
    }
    const value: CompileResult = { ok: false, error: parsed.data.error, timeMs, cached: false };
    // OVERLOADED is returned before the script runs, so a retry is safe — and
    // after jitter it often lands on a freed worker.
    return { value, retryable: response.status === 503 && parsed.data.error.kind === "OVERLOADED" };
  }
}

function unavailable(message: string): CompileResult {
  return { ok: false, error: { kind: "UNAVAILABLE", message }, timeMs: 0, cached: false };
}

/** Same script + same inputs ⇒ same answer (compiles are pure). */
function cacheKey(req: CompileRequest): string {
  const h = createHash("sha256");
  h.update(req.script);
  for (const i of req.inputs) {
    h.update("\0").update(i.name).update("\0").update(i.mimeType).update("\0").update(i.value);
  }
  return `dw:result:${h.digest("hex")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
