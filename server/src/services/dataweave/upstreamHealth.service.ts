/**
 * Upstream compiler health, ported from `checkHealthcheckUrl` in server.js.
 *
 * The heartbeat lives here but is STARTED only from server.ts, and its timer is
 * `unref()`d so it never keeps the process (or a test run) alive.
 */
import { contextLogger } from "../../lib/logger.ts";
import type { Clock, FetchLike } from "../../types/ports.ts";
import { systemClock } from "../../types/ports.ts";

/**
 * Shape returned by a probe. Note that `status` is the NUMERIC upstream HTTP
 * status (0 when unreachable) — the legacy response body relies on this.
 */
export interface UpstreamHealthResult {
  ok: boolean;
  status: number;
  durationMs: number;
  error?: string;
}

export class UpstreamHealthService {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly opts: { url: string; intervalMs: number },
    private readonly fetchImpl: FetchLike = fetch,
    private readonly clock: Clock = systemClock,
  ) {}

  get url(): string {
    return this.opts.url;
  }

  async checkUpstream(): Promise<UpstreamHealthResult> {
    const startedAt = this.clock.nowMs();
    const log = contextLogger();

    try {
      const response = await this.fetchImpl(this.opts.url, { method: "GET" });
      const durationMs = this.clock.nowMs() - startedAt;
      log.debug(
        { url: this.opts.url, status: response.status, ok: response.ok, durationMs },
        "[healthcheck] heartbeat ok",
      );
      return { ok: response.ok, status: response.status, durationMs };
    } catch (err) {
      const durationMs = this.clock.nowMs() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      log.error({ url: this.opts.url, durationMs, error: message }, "[healthcheck] heartbeat failed");
      return { ok: false, status: 0, durationMs, error: message };
    }
  }

  /** Begin periodic probing. Idempotent. */
  startHeartbeat(): void {
    if (this.timer) return;
    void this.checkUpstream();
    this.timer = setInterval(() => {
      void this.checkUpstream();
    }, this.opts.intervalMs);
    // Never hold the event loop open.
    this.timer.unref();
  }

  stopHeartbeat(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
