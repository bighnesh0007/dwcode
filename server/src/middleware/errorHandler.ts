/**
 * Central error handler for `/api/v1`.
 *
 * Guarantees: a consistent failure envelope, correct status codes, and never a
 * stack trace or internal message in the response body. 5xx details go to the log
 * only; the client gets a generic message plus the request id to quote.
 */
import type { ErrorRequestHandler } from "express";
import { RateLimitError } from "../errors/AppError.ts";
import { toAppError } from "../errors/toAppError.ts";
import type { ApiFailure } from "../types/envelope.ts";

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // If the response already started streaming there is nothing safe to do but
  // hand off to Express's default handler, which destroys the socket.
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = toAppError(err);
  const requestId = req.id ?? "unknown";

  const logPayload = {
    err: appError,
    code: appError.code,
    status: appError.status,
    method: req.method,
    url: req.originalUrl,
    ...(req.auth?.userId ? { userId: req.auth.userId } : {}),
  };

  // 5xx is a defect worth paging on; 4xx is routine client behaviour.
  if (appError.status >= 500) req.log?.error(logPayload, appError.message);
  else req.log?.warn(logPayload, appError.message);

  if (appError instanceof RateLimitError && appError.retryAfterSeconds !== undefined) {
    res.setHeader("Retry-After", String(appError.retryAfterSeconds));
  }

  const body: ApiFailure = {
    success: false,
    error: {
      code: appError.code,
      message: appError.expose ? appError.message : "Internal server error.",
      requestId,
      ...(appError.expose && appError.details !== undefined
        ? { details: appError.details }
        : {}),
    },
  };

  res.status(appError.status).json(body);
};
