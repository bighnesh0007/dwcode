/**
 * Express request augmentation.
 *
 * `req.validated` is populated by the validation middleware. Handlers read from
 * it rather than from `req.body`/`req.params`/`req.query`, which matters in
 * Express 5 where `req.query` is a lazy getter that must not be reassigned.
 */
import type { Logger } from "pino";
import type { VerifiedIdentity } from "./ports.ts";

declare global {
  namespace Express {
    interface Request {
      /** Correlation id: incoming `X-Request-Id` or a generated UUID. */
      id: string;
      /** Child logger already bound to `{ requestId, userId }`. */
      log: Logger;
      /** Present once `requireAuth`/`optionalAuth` has run and a token verified. */
      auth?: VerifiedIdentity;
      /** Output of the zod schemas declared for this route. */
      validated: {
        body?: unknown;
        params?: unknown;
        query?: unknown;
      };
    }
  }
}

export {};
