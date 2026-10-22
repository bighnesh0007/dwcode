import { z } from "zod";
import { LIMITS } from "../config/constants.ts";

/**
 * POST /api/v1/compiler/run. Sized from the shared playground limits, so the
 * client's own checks and this one cannot drift apart. The compiler service
 * enforces its own (larger) hard caps behind this.
 */
// Matches the compiler's own allowlist (compiler/…/HttpApi.java). Not
// application/java: that is the engine's Java-object bridge.
export const MIME_TYPES = [
  "application/json",
  "application/xml",
  "application/csv",
  "text/plain",
  "application/yaml",
  "application/x-ndjson",
] as const;

export const runSchema = z
  .object({
    script: z.string().min(1).max(LIMITS.playground.maxScriptLength),
    inputs: z
      .array(
        z
          .object({
            name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, "must be a valid identifier"),
            value: z.string().max(LIMITS.playground.maxFileLength),
            mimeType: z.enum(MIME_TYPES).default("application/json"),
          })
          .strict(),
      )
      .max(LIMITS.playground.maxFiles)
      .default([])
      .refine((inputs) => new Set(inputs.map((i) => i.name)).size === inputs.length, "input names must be unique"),
  })
  .strict();

export type RunInput = z.infer<typeof runSchema>;
