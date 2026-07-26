/**
 * Structured logging.
 *
 * Replaces the `console.log` calls in the original server.js / dataweaverunner.js.
 * Two rules:
 *   1. Never log a secret. The redaction list below is the safety net, not the plan.
 *   2. Business events go through `logEvent` so they are queryable by `event`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";
import { config } from "../config/index.ts";

export interface RequestContext {
  requestId: string;
  userId?: string;
  logger: Logger;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Paths scrubbed from every log record. */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "res.headers['set-cookie']",
  "*.accessToken",
  "*.access_token",
  "*.geminiApiKey",
  "*.apiKey",
  "*.clientSecret",
  "*.client_secret",
  "*.password",
  "*.token",
  "accessToken",
  "geminiApiKey",
  "apiKey",
];

export const logger: Logger = pino({
  level: config.isTest ? "silent" : config.log.level,
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  base: { service: "dwcode-server", env: config.env },
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(config.log.pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname,service,env" },
        },
      }
    : {}),
});

/** Run `fn` with a request context bound to the async execution path. */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * The context-aware logger: inside a request it is the request's child logger,
 * outside one (startup, background jobs) it is the root logger.
 */
export function contextLogger(): Logger {
  return storage.getStore()?.logger ?? logger;
}

/** Names of notable business events, so they stay greppable and consistent. */
export type BusinessEvent =
  | "legacy.transform.called"
  | "dataweave.run"
  | "submission.graded"
  | "submission.credit_withheld"
  | "solution.revealed"
  | "coins.awarded"
  | "problem.created"
  | "problem.updated"
  | "problem.deleted"
  | "contest.created"
  | "contest.joined"
  | "contest.left"
  | "contest.weekly_scheduled"
  | "contest.weekly_skipped"
  | "ai.problem_generated"
  | "ai.insight_generated"
  | "github.connected"
  | "github.disconnected"
  | "github.published"
  | "sponsorship.order_created"
  | "sponsorship.paid"
  | "sponsorship.failed"
  | "sponsorship.signature_rejected"
  | "sponsorship.webhook_rejected"
  | "admin.role_granted"
  | "admin.role_revoked"
  | "abuse.blocked"
  | "ratelimit.exceeded";

/**
 * Emit a structured business event. Always carries the request id so an event can
 * be joined back to the HTTP request that produced it.
 */
export function logEvent(
  event: BusinessEvent,
  data: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
): void {
  const ctx = storage.getStore();
  contextLogger()[level](
    { event, ...(ctx?.userId ? { userId: ctx.userId } : {}), ...data },
    event,
  );
}
