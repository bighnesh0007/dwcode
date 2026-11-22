import { z } from "zod";

export const clientErrorSchema = z
  .object({
    message: z.string().min(1).max(2000),
    source: z.string().max(500).optional(),
    stack: z.string().max(8000).optional(),
    url: z.string().max(1000).optional(),
  })
  .strict();
export type ClientErrorBody = z.infer<typeof clientErrorSchema>;

/** The legacy `application/csp-report` body; anything else in it is ignored. */
export const cspReportSchema = z.object({
  "csp-report": z.object({
    "document-uri": z.string().max(1000).optional(),
    "violated-directive": z.string().max(200).optional(),
    "effective-directive": z.string().max(200).optional(),
    "blocked-uri": z.string().max(1000).optional(),
  }).loose(),
}).loose();
export type CspReportBody = z.infer<typeof cspReportSchema>;

export const pageViewSchema = z.object({ path: z.string().min(1).max(500) }).strict();

export const moderationKind = z.enum(["blog", "comment", "user"]);

export const moderateSchema = z
  .object({
    kind: moderationKind,
    ref: z.string().trim().min(1).max(200),
    reason: z.string().trim().max(500).default(""),
    /** Suspensions only: days until it ends; omit for indefinite. */
    days: z.number().int().min(1).max(3650).nullable().default(null),
  })
  .strict();
export type ModerateBody = z.infer<typeof moderateSchema>;

export const moderationParamsSchema = z.object({ kind: moderationKind, ref: z.string().min(1).max(200) }).strict();
export const fingerprintParamsSchema = z.object({ fingerprint: z.string().regex(/^[0-9a-f]{8}$/) }).strict();
export const errorsQuerySchema = z.object({ resolved: z.enum(["true", "false"]).default("false") }).strict();
export const auditQuerySchema = z.object({ before: z.iso.datetime().optional() }).strict();
