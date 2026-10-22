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
  // Let Mongoose build indexes when models load. OFF unless asked for: with it
  // on, a dev server pointed at the production URI (as MONGODB_URI often is)
  // builds indexes on production collections. Use `npm run indexes` deliberately.
  MONGO_AUTO_INDEX: booleanish.default(false),

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

  // ── DataWeave compiler service (compiler/, ADR-006) ────────────────────────
  // Which runtime serves compiles. "upstream" keeps today's third-party URL;
  // "service" uses our own compiler. Rollback is flipping this back — no deploy.
  DW_BACKEND: z.enum(["upstream", "service"]).default("upstream"),
  // Render's private-network `hostport` has no scheme ("dwcode-compiler:10000"),
  // so a bare host:port is accepted and means plain http on the private network.
  COMPILER_SERVICE_URL: z
    .string()
    .transform((v) => (/^https?:\/\//.test(v) ? v : `http://${v}`))
    .pipe(z.url())
    .optional(),
  // Shared secret the compiler requires. Never sent anywhere but COMPILER_SERVICE_URL.
  COMPILER_AUTH_TOKEN: z.string().min(32).optional(),
  // Per-execution budget the compiler enforces by killing the worker. Warm runs
  // take milliseconds, so this only ever bounds hostile or runaway scripts.
  COMPILER_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),

  // ── Redis (rate limits, result cache, grading queue) ───────────────────────
  // Optional so local dev and the legacy deploy run without it; every consumer
  // falls back to process memory, which is correct only for a single instance.
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "must be a redis:// or rediss:// URL").optional(),

  // ── Grading ────────────────────────────────────────────────────────────────
  // Run hidden test cases (issue #10). Off until `npm run audit:problems` is
  // clean — a wrong hidden expectation makes a problem unpassable. Mirrors the
  // client's GRADE_HIDDEN_TESTS; set both the same during the migration.
  GRADE_HIDDEN_TESTS: booleanish.default(false),
  // Submissions graded at once per server instance. Each runs its cases one by
  // one, so this is also the instance's ceiling on concurrent compiler calls.
  GRADING_CONCURRENCY: z.coerce.number().int().min(1).max(128).default(8),
  // Spike guard: refuse new submissions (503) past this many waiting.
  GRADING_MAX_QUEUED: z.coerce.number().int().min(1).max(1_000_000).default(5_000),

  // ── Weekly contest scheduler ───────────────────────────────────────────────
  WEEKLY_CONTEST_ENABLED: booleanish.default(true),

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

/** Cross-field rules a per-field schema cannot express. */
const validatedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.DW_BACKEND === "service") {
    for (const key of ["COMPILER_SERVICE_URL", "COMPILER_AUTH_TOKEN"] as const) {
      if (env[key] === undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: "required when DW_BACKEND=service" });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/** Parse the given record, or throw with every problem listed. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = validatedEnvSchema.safeParse(source);
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
