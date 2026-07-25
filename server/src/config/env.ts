/**
 * The ONLY place in the codebase that reads `process.env`.
 *
 * Parsing happens once at import time and reports EVERY invalid variable at once
 * rather than failing on the first one — a half-configured deploy should tell you
 * everything that is wrong in a single log line.
 */
import { z } from "zod";

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // ── Database ───────────────────────────────────────────────────────────────
  // Optional so the legacy transform-only deployment keeps booting without Mongo.
  MONGODB_URI: z.string().min(1).optional(),

  // ── Clerk ──────────────────────────────────────────────────────────────────
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  // Accepted token issuer/audience checks. Leave unset to skip audience checks.
  CLERK_AUTHORIZED_PARTIES: csv.optional(),

  // ── Authorization ──────────────────────────────────────────────────────────
  SUPER_ADMIN_USER_ID: z.string().min(1).optional(),

  // ── DataWeave compiler (legacy contract) ───────────────────────────────────
  DW_COMPILER_URL: z.url()
    .default("https://dataweave-playground-h1p7.onrender.com/api/transform"),
  DW_VERSION: z.string().min(1).default("2.3.0"),
  DW_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  HEALTHCHECK_URL: z.url()
    .default("https://dataweave-playground-h1p7.onrender.com/healthCheck"),
  HEALTHCHECK_ENABLED: booleanish.default(true),
  HEALTHCHECK_INTERVAL_MS: z.coerce.number().int().positive().default(3 * 60 * 1000),

  // ── External services ──────────────────────────────────────────────────────
  GEMINI_API_KEY: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

  // ── Razorpay (sponsorship) ─────────────────────────────────────────────────
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  RAZORPAY_CURRENCY: z.string().length(3).default("INR"),

  // ── Secrets at rest ────────────────────────────────────────────────────────
  // 32-byte hex key for AES-256-GCM encryption of stored GitHub tokens.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex characters (32 bytes)")
    .optional(),
  // HMAC key for signing OAuth `state` (cookies are not viable cross-origin).
  OAUTH_STATE_SECRET: z.string().min(16).optional(),

  // ── HTTP ───────────────────────────────────────────────────────────────────
  APP_URL: z.url().default("http://localhost:8000"),
  // NOTE: in Zod 4 `.default()` supplies the OUTPUT value, so this is an array.
  CORS_ALLOWED_ORIGINS: csv.default(["http://localhost:8000"]),
  TRUST_PROXY: booleanish.default(false),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  LOG_PRETTY: booleanish.optional(),
});

export type Env = z.infer<typeof envSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/** Parse the given record, or throw with every problem listed. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${formatIssues(result.error)}`,
    );
  }
  return result.data;
}

/**
 * Variables that must be present for a given capability to work. `server.ts`
 * reports these as warnings so a transform-only deployment still boots, while a
 * full deployment fails loudly on the pieces it actually needs.
 */
export const CAPABILITY_REQUIREMENTS = {
  database: ["MONGODB_URI"],
  auth: ["CLERK_SECRET_KEY"],
  ai: ["GEMINI_API_KEY"],
  github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "OAUTH_STATE_SECRET"],
  tokenEncryption: ["TOKEN_ENCRYPTION_KEY"],
  // The webhook secret is required: without it we cannot verify Razorpay's callbacks,
  // and an unverified payment webhook is worse than no webhook at all.
  payments: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
} as const satisfies Record<string, readonly (keyof Env)[]>;

export type Capability = keyof typeof CAPABILITY_REQUIREMENTS;

/** Which capabilities are fully configured, and what each missing one needs. */
export function resolveCapabilities(env: Env): {
  enabled: Capability[];
  missing: { capability: Capability; vars: string[] }[];
} {
  const enabled: Capability[] = [];
  const missing: { capability: Capability; vars: string[] }[] = [];

  for (const [capability, vars] of Object.entries(CAPABILITY_REQUIREMENTS)) {
    const absent = vars.filter((name) => env[name as keyof Env] === undefined);
    if (absent.length === 0) enabled.push(capability as Capability);
    else missing.push({ capability: capability as Capability, vars: absent });
  }

  return { enabled, missing };
}
