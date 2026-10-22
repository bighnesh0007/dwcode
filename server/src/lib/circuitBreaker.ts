/**
 * A minimal circuit breaker for one dependency.
 *
 *   closed     calls go through; consecutive failures are counted
 *   open       calls fail fast for `openMs` — no waiting on a dependency that is down
 *   half-open  after `openMs`, ONE probe is let through; success closes, failure re-opens
 *
 * Only infrastructure failures count. A user's compile error is the dependency
 * working correctly and must never trip the breaker.
 */
import type { Clock } from "../types/ports.ts";

export type BreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  openMs: number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  private state_: BreakerState = "closed";

  constructor(
    private readonly opts: CircuitBreakerOptions,
    private readonly clock: Clock,
  ) {}

  get state(): BreakerState {
    if (this.state_ === "open" && this.clock.nowMs() - this.openedAt >= this.opts.openMs) {
      this.state_ = "half-open";
    }
    return this.state_;
  }

  /** Whether a call may proceed now. In half-open, admits exactly one probe. */
  tryAcquire(): boolean {
    const s = this.state;
    if (s === "closed") return true;
    if (s === "half-open" && !this.probeInFlight) {
      this.probeInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.probeInFlight = false;
    this.state_ = "closed";
  }

  recordFailure(): void {
    this.probeInFlight = false;
    if (this.state_ === "half-open") {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.opts.failureThreshold) this.trip();
  }

  private trip(): void {
    this.state_ = "open";
    this.openedAt = this.clock.nowMs();
    this.failures = 0;
  }
}
