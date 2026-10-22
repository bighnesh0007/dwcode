/**
 * Chooses, per call, which database a repository function runs on — issue #23,
 * Phase 3. Controlled by DATA_BACKEND (see lib/config.ts):
 *
 * - `mongo`: the Mongoose implementation only.
 * - `shadow`: Mongo is served. Reads also run on Postgres and the two answers
 *   are compared; writes are mirrored to Postgres after Mongo succeeds. A
 *   Postgres failure or mismatch is logged and never reaches the user.
 * - `postgres`: the Drizzle implementation only.
 *
 * Mismatch logs carry the operation and the first differing field path, never
 * values: some reads return access tokens.
 */
import { DATA_BACKEND, type DataBackend } from "@/lib/config";

let override: DataBackend | null = null;

/** The active backend. */
export function dataBackend(): DataBackend {
  return override ?? DATA_BACKEND;
}

/** Tests only: force a backend, or pass null to restore the configured one. */
export function setDataBackendForTests(mode: DataBackend | null) {
  override = mode;
}

export interface ShadowEvent {
  op: string;
  kind: "mismatch" | "read-error" | "write-error";
  /** First differing path, e.g. `[2].participants[0].score`. */
  path?: string;
  error?: string;
}

type Listener = (event: ShadowEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to shadow events (tests, metrics). Returns an unsubscribe function. */
export function onShadowEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function report(event: ShadowEvent) {
  console.warn(JSON.stringify({ shadow: event.kind, op: event.op, path: event.path, error: event.error }));
  for (const listener of listeners) listener(event);
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

export interface CompareOptions {
  /** Drop `_id` from top-level records: the Postgres table is keyed by user, not by a Mongo id. */
  ignoreId?: boolean;
  /** Keys whose array values have no meaningful order; compared as sorted. */
  unordered?: string[];
}

/** Dates this close are equal: a mirrored write stamps its own time. */
const DATE_TOLERANCE_MS = 5000;

/**
 * Canonical form for comparison: ObjectIds become hex, dates become
 * `{ $date: ms }`, keys are sorted, `__v` is dropped, and `_id` is kept only on
 * top-level records — Mongo gives embedded subdocuments ids that Postgres has
 * no column for. Arrays of records are sorted by `_id` so ties in a sort order
 * do not count as differences.
 */
export function canonicalise(value: unknown, options: CompareOptions = {}, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return { $date: value.getTime() };
  if (typeof value === "object" && typeof (value as { toHexString?: unknown }).toHexString === "function") {
    return (value as { toHexString: () => string }).toHexString();
  }
  if (value instanceof Map) return canonicalise(Object.fromEntries(value), options, depth);
  if (Array.isArray(value)) {
    const items = value.map((v) => canonicalise(v, options, depth + 1));
    const ids = items.map((i) => (i && typeof i === "object" && "_id" in i ? String((i)._id) : null));
    if (ids.every((id) => id !== null)) {
      return items.map((item, i) => [ids[i], item] as const)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, item]) => item);
    }
    // User-keyed lists come from unsorted queries; compare them as sets.
    if (options.ignoreId && items.every((i) => i !== null && typeof i === "object")) {
      return [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "__v") continue;
      if (key === "_id" && (depth > 1 || options.ignoreId)) continue;
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      const c = canonicalise(v, options, depth + 1);
      out[key] = options.unordered?.includes(key) && Array.isArray(c)
        ? [...c].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
        : c;
    }
    return out;
  }
  return value;
}

/** The first path at which two canonical values differ, or null when equal. */
export function firstDifference(a: unknown, b: unknown, path = ""): string | null {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return path || "(root)";
  if (Array.isArray(a) !== Array.isArray(b)) return path || "(root)";
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  if (typeof ao.$date === "number" && typeof bo.$date === "number") {
    return Math.abs(ao.$date - bo.$date) <= DATE_TOLERANCE_MS ? null : path || "(root)";
  }
  for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
    const d = firstDifference(ao[key], bo[key], path ? `${path}.${key}` : key);
    if (d) return d;
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- generic over any function signature */
type Fn = (...args: any[]) => Promise<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Adapt a Postgres implementation to the Mongo function's signature.
 *
 * Only the arguments are type-checked against Mongo: Mongoose's inferred
 * types describe documents (DocumentArray, the whole schema even when a query
 * selects three fields), not what a lean query returns, so a structural check
 * of results would test the types rather than the data. Result parity is
 * checked where it is real — by shadow reads in production and by the parity
 * suite (__tests__/postgres/parity.integration.test.ts), which runs both
 * implementations on the same data.
 */
export function pgImpl<F extends Fn>(fn: (...args: Parameters<F>) => Promise<unknown>): F {
  return fn as F;
}

/**
 * A read. In shadow mode both run concurrently, so the added latency is the
 * slower of the two, not their sum.
 */
export function read<F extends Fn>(op: string, mongo: F, postgres: F, options: CompareOptions = {}): F {
  return (async (...args: Parameters<F>) => {
    const mode = dataBackend();
    if (mode === "mongo") return mongo(...args);
    if (mode === "postgres") return postgres(...args);
    const [served, shadow] = await Promise.allSettled([mongo(...args), postgres(...args)]);
    if (served.status === "rejected") throw served.reason;
    if (shadow.status === "rejected") {
      report({ op, kind: "read-error", error: errorText(shadow.reason) });
    } else {
      const path = firstDifference(canonicalise(served.value, options), canonicalise(shadow.value, options));
      if (path) report({ op, kind: "mismatch", path });
    }
    return served.value;
  }) as F;
}

/**
 * A write. In shadow mode Mongo runs first and its result is returned; then
 * `mirror` repeats the write on Postgres, given Mongo's result so a create can
 * reuse Mongo's id. `mirror` defaults to calling `postgres` with the same
 * arguments, which suits idempotent writes keyed by the caller.
 */
export function write<F extends Fn>(
  op: string,
  mongo: F,
  postgres: F,
  mirror?: (result: Awaited<ReturnType<F>>, ...args: Parameters<F>) => Promise<unknown>,
): F {
  return (async (...args: Parameters<F>) => {
    const mode = dataBackend();
    if (mode === "mongo") return mongo(...args);
    if (mode === "postgres") return postgres(...args);
    const result = (await mongo(...args)) as Awaited<ReturnType<F>>;
    try {
      await (mirror ? mirror(result, ...args) : postgres(...args));
    } catch (err) {
      report({ op, kind: "write-error", error: errorText(err) });
    }
    return result;
  }) as F;
}
