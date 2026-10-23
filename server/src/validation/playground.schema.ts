import { z } from "zod";
import { LIMITS } from "../config/constants.ts";

const P = LIMITS.playground;

const fileSchema = z
  .object({
    name: z.string().max(200).optional(),
    kind: z.enum(["payload", "vars", "attributes", "custom"]).optional(),
    language: z.enum(["json", "xml", "csv", "yaml", "text", "java", "ndjson", "multipart"]).optional(),
    content: z.string().max(P.maxFileLength, `each file is limited to ${P.maxFileLength} characters`).optional(),
  })
  .strict();

export type ShareFileInput = z.infer<typeof fileSchema>;

const script = z
  .string()
  .max(P.maxScriptLength, `script is limited to ${P.maxScriptLength} characters`)
  .refine((s) => s.trim().length > 0, "script is required");

export const shareSchema = z
  .object({
    script,
    files: z.array(fileSchema).max(P.maxFiles).default([]),
    testCases: z
      .array(
        z
          .object({
            name: z.string().max(200).optional(),
            files: z.array(fileSchema).max(P.maxFiles).optional(),
            expectedOutput: z.string().max(P.maxFileLength).optional(),
          })
          .strict(),
      )
      .max(P.maxTestCases)
      .default([]),
  })
  .strict();

export type ShareInput = z.infer<typeof shareSchema>;

/** New ids are 22-char base64url; legacy ones are 12 hex chars. */
export const shareParamsSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) }).strict();

export const pushSchema = z
  .object({
    script,
    files: z
      .array(
        z
          .object({
            name: z.string().max(200).optional(),
            content: z.string().max(P.maxFileLength).default(""),
          })
          .strict(),
      )
      .max(P.maxFiles)
      .default([]),
    testCases: z
      .array(
        z
          .object({
            name: z.string().max(200),
            expectedOutput: z.string().max(P.maxFileLength).optional(),
          })
          .strict(),
      )
      .max(P.maxTestCases)
      .default([]),
    output: z.string().max(P.maxFileLength).optional(),
    message: z.string().max(200).optional(),
  })
  .strict();

export type PushInput = z.infer<typeof pushSchema>;

/** owner/name, as GitHub allows them. Blocks path tricks in the URL we build. */
export const repoSchema = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/, "must be owner/name")
  .refine((r) => !r.endsWith("/..") && !r.endsWith("/."), "must be owner/name");

const filePath = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (p) => !p.startsWith("/") && !/[\u0000-\u001f\\?#]/.test(p) && p.split("/").every((s) => s && s !== "." && s !== ".."),
    "invalid path",
  );

export const repoFilesQuerySchema = z.object({ repo: repoSchema }).strict();
export const repoFileQuerySchema = z.object({ repo: repoSchema, path: filePath }).strict();
