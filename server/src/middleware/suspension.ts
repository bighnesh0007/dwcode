/**
 * Suspended users (SFCode parity, Phase F) may read but not write. The set of
 * active suspensions is small and cached briefly per process; a suspend or
 * unsuspend in this process clears it at once. Fails open: if the lookup
 * errors, the request is allowed and the failure logged, so a database blip
 * never locks everyone out.
 */
import * as ops from "../data/repositories/ops.ts";
import { logger } from "../lib/logger.ts";

const TTL_MS = 30_000;
let cache: { at: number; ids: ReadonlySet<string> } | null = null;

export function invalidateSuspensions(): void {
  cache = null;
}

export async function isSuspended(userId: string, now = Date.now()): Promise<boolean> {
  try {
    if (!cache || now - cache.at > TTL_MS) {
      const rows = await ops.moderated("user", new Date(now));
      cache = { at: now, ids: new Set(rows.map((r) => r.ref)) };
    }
    return cache.ids.has(userId);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[suspension] lookup failed; allowing");
    return false;
  }
}
