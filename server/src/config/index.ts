/**
 * Frozen, typed configuration object. Import this — never `process.env`.
 */
import { parseEnv, resolveCapabilities, type Capability, type Env } from "./env.ts";

const env: Env = parseEnv();

export const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,

  mongoUri: env.MONGODB_URI,

  clerk: Object.freeze({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    authorizedParties: env.CLERK_AUTHORIZED_PARTIES,
  }),

  superAdminUserId: env.SUPER_ADMIN_USER_ID,

  dataweave: Object.freeze({
    compilerUrl: env.DW_COMPILER_URL,
    version: env.DW_VERSION,
    timeoutMs: env.DW_TIMEOUT_MS,
  }),

  healthcheck: Object.freeze({
    url: env.HEALTHCHECK_URL,
    enabled: env.HEALTHCHECK_ENABLED,
    intervalMs: env.HEALTHCHECK_INTERVAL_MS,
  }),

  gemini: Object.freeze({ apiKey: env.GEMINI_API_KEY }),

  github: Object.freeze({
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  }),

  razorpay: Object.freeze({
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    currency: env.RAZORPAY_CURRENCY,
  }),

  secrets: Object.freeze({
    tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
    oauthStateSecret: env.OAUTH_STATE_SECRET,
  }),

  http: Object.freeze({
    appUrl: env.APP_URL,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
    trustProxy: env.TRUST_PROXY,
  }),

  log: Object.freeze({
    level: env.LOG_LEVEL,
    pretty: env.LOG_PRETTY ?? env.NODE_ENV === "development",
  }),
});

export type Config = typeof config;

export const capabilities = resolveCapabilities(env);

export function hasCapability(capability: Capability): boolean {
  return capabilities.enabled.includes(capability);
}

export type { Capability };
