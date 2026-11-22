/**
 * Platform and admin (SFCode parity, Phase F): analytics, the audit log,
 * moderation (hide posts and comments, suspend users) and client telemetry
 * (errors, CSP reports, page views) with an error inbox.
 *
 * Telemetry is anonymous and minimal: no user ids, URLs without query
 * strings, messages and stacks truncated. Errors are grouped by a fingerprint
 * of their kind, message (numbers masked) and source.
 */
import { utcDay } from "@dwcode/shared";
import { BadRequestError, NotFoundError } from "../../errors/AppError.ts";
import { invalidateSuspensions } from "../../middleware/suspension.ts";
import type { ContributionRepository } from "../../repositories/contribution.repository.ts";
import type { OpsRepository } from "../../repositories/ops.repository.ts";
import type { Clock, IdentityProvider } from "../../types/ports.ts";
import { sendTestEmail } from "../notifications/email.ts";
import { STORE_OVERRIDES_KEY, invalidateStoreOverrides, sellableItems, type StoreOverrides } from "../users/store.service.ts";
import { recordAudit } from "./audit.ts";
import { invalidateHidden } from "./hiddenContent.ts";

const DAY_MS = 86_400_000;
const ANALYTICS_DAYS = 30;
const TOP_PATHS = 10;
const AUDIT_PAGE = 100;
const ERRORS_PAGE = 100;

export type ModerationKind = "blog" | "comment" | "user";

/** Longest input the fingerprint reads; callers already clip, this makes the bound explicit. */
const FINGERPRINT_MAX = 1024;

function fnv1aHex(input: string): string {
  const text = input.slice(0, FINGERPRINT_MAX);
  const n = Math.min(text.length, FINGERPRINT_MAX);
  let hash = 0x811c9dc5;
  for (let i = 0; i < n; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A URL or path without its query string or fragment, clipped. */
export function cleanPath(url: string | undefined, max = 200): string {
  if (!url) return "";
  let path: string;
  try {
    const u = new URL(url, "https://dwcode.invalid");
    path = u.origin === "https://dwcode.invalid" ? u.pathname : `${u.origin}${u.pathname}`;
  } catch {
    path = url.split(/[?#]/)[0] ?? "";
  }
  return path.slice(0, max);
}

export interface ClientErrorReport {
  kind: "error" | "csp";
  message: string;
  source?: string | undefined;
  stack?: string | undefined;
  url?: string | undefined;
  userAgent?: string | undefined;
}

export class OpsService {
  constructor(
    private readonly ops: OpsRepository,
    private readonly contributions: ContributionRepository,
    private readonly clock: Clock,
  ) {}

  private now(): Date {
    return new Date(this.clock.nowMs());
  }

  // ── Telemetry ─────────────────────────────────────────────────────────────

  async reportError(r: ClientErrorReport): Promise<void> {
    const message = r.message.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!message) return;
    const source = cleanPath(r.source);
    const fingerprint = fnv1aHex(`${r.kind}|${message.replace(/\d+/g, "N")}|${source}`);
    const sample: Record<string, string> = {};
    if (r.url) sample.url = cleanPath(r.url);
    if (r.stack) sample.stack = r.stack.slice(0, 2000);
    if (r.userAgent) sample.userAgent = r.userAgent.slice(0, 200);
    await this.ops.recordError({ fingerprint, kind: r.kind, message, source, sample }, this.now());
  }

  async pageView(path: string): Promise<void> {
    const clean = cleanPath(path);
    if (!clean.startsWith("/")) return;
    await this.ops.recordPageView(utcDay(this.now()), clean);
  }

  errors(resolved: boolean) {
    return this.ops.listErrors(resolved, ERRORS_PAGE);
  }

  async resolveError(actorId: string, fingerprint: string) {
    if (!(await this.ops.resolveError(fingerprint))) throw new NotFoundError("No such error.");
    await recordAudit(actorId, "error.resolve", fingerprint);
    return { resolved: true };
  }

  // ── Moderation ────────────────────────────────────────────────────────────

  async moderation() {
    const now = this.now();
    const [blog, comment, user] = await Promise.all([
      this.ops.moderated("blog", now), this.ops.moderated("comment", now), this.ops.moderated("user", now),
    ]);
    return { blog, comment, user };
  }

  async moderate(actorId: string, kind: ModerationKind, ref: string, reason: string, days: number | null, protectedIds: ReadonlySet<string>) {
    if (kind === "user") {
      if (ref === actorId) throw new BadRequestError("You can't suspend yourself.");
      if (protectedIds.has(ref)) throw new BadRequestError("Admins can't be suspended; revoke their role first.");
    } else if (days !== null) {
      throw new BadRequestError("Only suspensions have an end date.");
    }
    const until = days === null ? null : new Date(this.clock.nowMs() + days * DAY_MS);
    const row = await this.ops.moderate(kind, ref, { reason, actorId, until });
    if (kind === "user") invalidateSuspensions();
    else invalidateHidden();
    await recordAudit(actorId, kind === "user" ? "user.suspend" : `${kind}.hide`, ref, { reason, until: until?.toISOString() ?? null });
    return row;
  }

  async unmoderate(actorId: string, kind: ModerationKind, ref: string) {
    if (!(await this.ops.unmoderate(kind, ref))) throw new NotFoundError("Nothing to undo.");
    if (kind === "user") invalidateSuspensions();
    else invalidateHidden();
    await recordAudit(actorId, kind === "user" ? "user.unsuspend" : `${kind}.unhide`, ref);
    return { undone: true };
  }

  // ── Store editor ──────────────────────────────────────────────────────────

  async storeItems(settings: { get(key: string): Promise<unknown> }) {
    const raw = await settings.get(STORE_OVERRIDES_KEY);
    const overrides = raw && typeof raw === "object" ? (raw as StoreOverrides) : {};
    return { items: sellableItems().map((i) => ({ ...i, override: overrides[i.id] ?? null })) };
  }

  async setStoreOverrides(actorId: string, overrides: StoreOverrides, settings: { get(key: string): Promise<unknown>; set(key: string, value: unknown, by: string): Promise<void> }) {
    const known = new Map(sellableItems().map((i) => [i.id, i]));
    const clean: StoreOverrides = {};
    for (const [id, o] of Object.entries(overrides)) {
      const item = known.get(id);
      if (!item) throw new BadRequestError(`Unknown item: ${id}`);
      // Free items stay free: they are owned by everyone already.
      if (item.cost === 0 && o.cost !== undefined) throw new BadRequestError(`${item.name} is free for everyone and can't be priced.`);
      if (o.cost !== undefined || o.disabled) clean[id] = { ...(o.cost !== undefined ? { cost: o.cost } : {}), ...(o.disabled ? { disabled: true } : {}) };
    }
    await settings.set(STORE_OVERRIDES_KEY, clean, actorId);
    invalidateStoreOverrides();
    await recordAudit(actorId, "store.edit", "", { overrides: clean });
    return this.storeItems(settings);
  }

  // ── Email test ────────────────────────────────────────────────────────────

  /** Send a test email to the calling admin's own address. */
  async emailTest(actorId: string, identity: IdentityProvider) {
    const user = await identity.getUser(actorId);
    if (!user?.primaryEmail) throw new BadRequestError("Your account has no email address.");
    try {
      await sendTestEmail(user.primaryEmail);
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : "Sending failed.");
    }
    await recordAudit(actorId, "email.test", "");
    return { sent: true, to: user.primaryEmail };
  }

  // ── Audit log and analytics ───────────────────────────────────────────────

  auditLog(before?: Date) {
    return this.ops.auditLog(AUDIT_PAGE, before);
  }

  async analytics() {
    const now = this.now();
    const since = new Date(now.getTime() - ANALYTICS_DAYS * DAY_MS);
    const weekAgo = utcDay(new Date(now.getTime() - 7 * DAY_MS));
    const [users, submissions, views, openErrors, queue] = await Promise.all([
      this.ops.userCounts(new Date(now.getTime() - 7 * DAY_MS)),
      this.ops.submissionsByDay(since),
      this.ops.pageViewsSince(utcDay(since)),
      this.ops.countOpenErrors(),
      this.contributions.listByStatus("submitted", undefined, 1000),
    ]);
    const byDay = new Map<string, number>();
    const byPath = new Map<string, number>();
    for (const v of views) {
      byDay.set(v.day, (byDay.get(v.day) ?? 0) + v.count);
      if (v.day >= weekAgo) byPath.set(v.path, (byPath.get(v.path) ?? 0) + v.count);
    }
    const days: string[] = [];
    for (let i = ANALYTICS_DAYS - 1; i >= 0; i--) days.push(utcDay(new Date(now.getTime() - i * DAY_MS)));
    const subsByDay = new Map(submissions.map((s) => [s.day, s]));
    return {
      users: { total: users.total, newThisWeek: users.recent },
      daily: days.map((day) => ({
        day,
        submissions: subsByDay.get(day)?.total ?? 0,
        accepted: subsByDay.get(day)?.accepted ?? 0,
        views: byDay.get(day) ?? 0,
      })),
      topPaths: [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_PATHS).map(([path, count]) => ({ path, count })),
      openErrors,
      reviewQueue: queue.length,
    };
  }
}
