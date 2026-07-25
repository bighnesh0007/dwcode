/**
 * Error taxonomy.
 *
 * `expose` decides whether `message` may be shown to the caller. Anything that is
 * not explicitly exposed is reported as a generic message, so internal details and
 * stack traces never reach a client.
 */
import { ErrorCode, type ErrorCodeValue } from "./codes.ts";

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number;
  /** Safe to send to the client? */
  readonly expose: boolean;
  /** Structured detail (e.g. zod issues). Only sent when `expose` is true. */
  readonly details?: unknown;

  constructor(opts: {
    code: ErrorCodeValue;
    message: string;
    status: number;
    expose?: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(opts.message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = new.target.name;
    this.code = opts.code;
    this.status = opts.status;
    this.expose = opts.expose ?? opts.status < 500;
    if (opts.details !== undefined) this.details = opts.details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed.", details?: unknown) {
    super({
      code: ErrorCode.VALIDATION_FAILED,
      message,
      status: 400,
      expose: true,
      ...(details === undefined ? {} : { details }),
    });
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request.", code: ErrorCodeValue = ErrorCode.BAD_REQUEST) {
    super({ code, message, status: 400, expose: true });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(
    message = "Authentication required.",
    code: ErrorCodeValue = ErrorCode.UNAUTHENTICATED,
  ) {
    super({ code, message, status: 401, expose: true });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.", code: ErrorCodeValue = ErrorCode.FORBIDDEN) {
    super({ code, message, status: 403, expose: true });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super({ code: ErrorCode.NOT_FOUND, message, status: 404, expose: true });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflicting state.", code: ErrorCodeValue = ErrorCode.CONFLICT) {
    super({ code, message, status: 409, expose: true });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Payload too large.") {
    super({ code: ErrorCode.PAYLOAD_TOO_LARGE, message, status: 413, expose: true });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds?: number;
  constructor(message = "Too many requests.", retryAfterSeconds?: number) {
    super({ code: ErrorCode.RATE_LIMITED, message, status: 429, expose: true });
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AbuseDetectedError extends AppError {
  constructor(message = "Request rejected by abuse protection.") {
    super({ code: ErrorCode.ABUSE_DETECTED, message, status: 429, expose: true });
  }
}

export class DuplicateRequestError extends AppError {
  constructor(message = "Identical request already in flight or just completed.") {
    super({ code: ErrorCode.DUPLICATE_REQUEST, message, status: 409, expose: true });
  }
}

/** A capability is switched off because its env vars are absent. */
export class NotConfiguredError extends AppError {
  constructor(what: string) {
    super({
      code: ErrorCode.NOT_CONFIGURED,
      message: `${what} is not configured on this server.`,
      status: 503,
      expose: true,
    });
  }
}

export class UpstreamError extends AppError {
  constructor(message = "Upstream service failed.", opts: { timeout?: boolean; expose?: boolean; cause?: unknown } = {}) {
    super({
      code: opts.timeout ? ErrorCode.UPSTREAM_TIMEOUT : ErrorCode.UPSTREAM_FAILED,
      message,
      status: opts.timeout ? 504 : 502,
      expose: opts.expose ?? true,
      ...(opts.cause === undefined ? {} : { cause: opts.cause }),
    });
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error.", cause?: unknown) {
    super({
      code: ErrorCode.INTERNAL,
      message,
      status: 500,
      expose: false,
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

/**
 * Errors thrown by the DataWeave compiler client.
 *
 * The legacy `POST /api/transform` contract renders EVERY failure as
 * `400 { error: <message> }` with the runner's exact text, and those strings are
 * surfaced verbatim in the UI — hence `expose: true` and a dedicated class the
 * legacy error handler can recognise.
 */
export class LegacyCompilerError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({
      code: ErrorCode.UPSTREAM_FAILED,
      message,
      status: 400,
      expose: true,
      ...(cause === undefined ? {} : { cause }),
    });
  }
}
