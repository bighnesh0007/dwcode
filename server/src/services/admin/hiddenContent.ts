/**
 * Hidden blog posts and comments (SFCode parity, Phase F moderation), cached
 * briefly per process. Readers filter with these sets; a hide or unhide in
 * this process clears the cache at once. Fails open to "nothing hidden".
 */
import * as ops from "../../data/repositories/ops.ts";
import { logger } from "../../lib/logger.ts";

export type HiddenKind = "blog" | "comment";
const TTL_MS = 30_000;
const cache = new Map<HiddenKind, { at: number; refs: ReadonlySet<string> }>();

export function invalidateHidden(): void {
  cache.clear();
}

export async function hiddenRefs(kind: HiddenKind): Promise<ReadonlySet<string>> {
  const now = Date.now();
  const hit = cache.get(kind);
  if (hit && now - hit.at < TTL_MS) return hit.refs;
  try {
    const refs = new Set((await ops.moderated(kind, new Date(now))).map((r) => r.ref));
    cache.set(kind, { at: now, refs });
    return refs;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), kind }, "[moderation] lookup failed; showing everything");
    return new Set();
  }
}
