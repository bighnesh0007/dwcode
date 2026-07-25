/**
 * Assigns a correlation id to every request and binds a child logger to the async
 * execution path, so any code downstream can log with the request id without it
 * being threaded through every function signature.
 */
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger, runWithContext } from "../lib/logger.ts";

const REQUEST_ID_HEADER = "x-request-id";
/** Reject absurd inbound ids rather than logging attacker-controlled noise. */
const MAX_INBOUND_ID_LENGTH = 200;
const SAFE_ID = /^[\w.:-]+$/;

export const requestContext: RequestHandler = (req, res, next) => {
  const inbound = req.get(REQUEST_ID_HEADER);
  const requestId =
    inbound && inbound.length <= MAX_INBOUND_ID_LENGTH && SAFE_ID.test(inbound)
      ? inbound
      : randomUUID();

  req.id = requestId;
  req.log = logger.child({ requestId });
  req.validated = {};
  res.setHeader("X-Request-Id", requestId);

  runWithContext({ requestId, logger: req.log }, () => {
    next();
  });
};
