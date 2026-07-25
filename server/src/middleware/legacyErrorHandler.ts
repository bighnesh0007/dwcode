/**
 * Router-scoped error handler for the FROZEN legacy DataWeave endpoints.
 *
 * The original implementation (server.js) collapsed every failure — bad script,
 * bad inputs, unreachable upstream, upstream non-2xx, upstream {error}, timeout —
 * into `400 { error: "<message>" }`, and those message strings are surfaced
 * verbatim in the DWCode UI. Reproducing that exactly is the whole point of this
 * handler, so it must not be "improved" to use proper status codes.
 *
 * The one addition is 429 for rate limiting, which did not exist before and
 * therefore cannot break an existing caller; the body shape stays `{ error }`.
 */
import type { ErrorRequestHandler } from "express";
import { toAppError } from "../errors/toAppError.ts";
import { ErrorCode } from "../errors/codes.ts";

export const legacyErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = toAppError(err);
  req.log?.error(
    { err: appError, code: appError.code, url: req.originalUrl },
    "[legacy] transform failed",
  );

  const status = appError.code === ErrorCode.RATE_LIMITED ? 429 : 400;

  // Exactly one key, exactly as before.
  res.status(status).json({
    error: appError.expose ? appError.message : "Transform failed.",
  });
};
