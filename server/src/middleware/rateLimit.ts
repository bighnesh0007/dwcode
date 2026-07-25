/**
 * Layered rate limiting.
 *
 * `express-rate-limit`'s `Store` interface IS the swap point: `rate-limit-redis`
 * implements the same interface, so moving off memory later is a store swap in the
 * container, with no change to any policy or route.
 */
import rateLimitImport, { ipKeyGenerator } from "express-rate-limit";
import type { Options, RateLimitRequestHandler } from "express-rate-limit";
import { RATE_LIMIT_POLICIES, type RateLimitPolicyName } from "../config/constants.ts";
import { RateLimitError } from "../errors/AppError.ts";
import { logEvent } from "../lib/logger.ts";
import { interopDefault } from "../lib/interop.ts";

/**
 * Same CJS/ESM declaration split as helmet — the default export is only callable
 * under the ESM declaration. `ipKeyGenerator` is a real named export in BOTH
 * declaration files, so it imports normally. See lib/interop.ts.
 */
type RateLimitFactory = (options?: Partial<Options>) => RateLimitRequestHandler;
const rateLimit = interopDefault<RateLimitFactory>(rateLimitImport);

/**
 * Build a limiter from a named policy.
 *
 * `keyBy: "user"` keys on the authenticated user id and falls back to IP for
 * anonymous callers — so one signed-in user cannot exhaust the quota of everyone
 * behind the same NAT, and an anonymous flood is still bounded.
 */
export function createLimiter(name: RateLimitPolicyName): RateLimitRequestHandler {
  const policy = RATE_LIMIT_POLICIES[name];

  return rateLimit({
    windowMs: policy.windowMs,
    limit: policy.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
      if (policy.keyBy === "user" && req.auth?.userId) return `u:${req.auth.userId}`;
      // `ipKeyGenerator` normalises IPv6 to a /56 subnet. Using the raw `req.ip`
      // would let anyone holding an IPv6 range rotate addresses to bypass the limit
      // entirely — express-rate-limit flags this as ERR_ERL_KEY_GEN_IPV6.
      if (!req.ip) return "ip:unknown";
      return `ip:${ipKeyGenerator(req.ip)}`;
    },
    handler: (req, _res, next) => {
      logEvent(
        "ratelimit.exceeded",
        { policy: name, method: req.method, path: req.path },
        "warn",
      );
      next(new RateLimitError("Too many requests. Slow down.", Math.ceil(policy.windowMs / 1000)));
    },
  });
}
