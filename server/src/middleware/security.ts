/**
 * Security middleware: headers, CORS, and body-operator stripping.
 *
 * Note on sanitisation: `express-mongo-sanitize` is deliberately NOT used. It
 * mutates `req.query`, which in Express 5 is a lazy getter, and that combination
 * throws. Instead we strip Mongo operators from the request BODY only, and rely on
 * strict zod schemas (which drop unknown keys) for params and query.
 */
import cors, { type CorsOptions } from "cors";
import helmetImport from "helmet";
import type { HelmetOptions } from "helmet";
import type { RequestHandler } from "express";
import { config } from "../config/index.ts";
import { interopDefault } from "../lib/interop.ts";

/**
 * helmet ships both CJS and ESM declarations, and resolvers disagree about which to
 * use — under the CJS one a default import types as the module namespace and is not
 * callable. Normalise it and state the factory type explicitly. See lib/interop.ts.
 */
type HelmetFactory = (options?: Readonly<HelmetOptions>) => RequestHandler;
const helmet = interopDefault<HelmetFactory>(helmetImport);

/** Headers suitable for a JSON-only API. */
export function securityHeaders(): RequestHandler {
  return helmet({
    // No HTML is served, so a CSP would only add risk of breaking clients.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
  });
}

/**
 * CORS for `/api/v1`: an explicit allowlist, credentials disabled because auth
 * travels as a bearer token rather than a cookie.
 */
export function v1Cors(): RequestHandler {
  const allowed = new Set(config.http.corsAllowedOrigins);

  const options: CorsOptions = {
    origin(origin, callback) {
      // Same-origin/server-to-server requests send no Origin header; allow them.
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowed.has(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id", "Idempotency-Key"],
    exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
    credentials: false,
    maxAge: 600,
  };

  return cors(options);
}

/** Wide-open CORS, matching the legacy service's `app.use(cors())`. */
export function legacyCors(): RequestHandler {
  return cors();
}

function stripOperators(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) return value.map((item) => stripOperators(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    // Drop `$gt`-style operators and dotted paths that could reach into subdocs.
    if (key.startsWith("$") || key.includes(".")) continue;
    out[key] = stripOperators(val, depth + 1);
  }
  return out;
}

/**
 * Remove Mongo query operators from the parsed body. Applied after the JSON body
 * parser and before validation.
 */
export const sanitizeBody: RequestHandler = (req, _res, next) => {
  if (req.body !== undefined && req.body !== null && typeof req.body === "object") {
    req.body = stripOperators(req.body);
  }
  next();
};
