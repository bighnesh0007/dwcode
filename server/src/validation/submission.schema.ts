import { z } from "zod";
import { LIMITS } from "../config/constants.ts";

/**
 * `.strict()` is the C-4 guard: a body carrying `status` (or any verdict field)
 * is rejected, so a forgery attempt shows up as a 400 instead of failing quietly.
 */
export const submitSchema = z
  .object({
    problemId: z.string().regex(/^[0-9a-f]{24}$/i, "must be an ObjectId"),
    code: z.string().trim().min(1, "code is required").max(LIMITS.code.maxLength),
    input: z.string().max(LIMITS.playground.maxFileLength).optional(),
  })
  .strict();

export type SubmitInput = z.infer<typeof submitSchema>;

export const jobParamsSchema = z.object({ jobId: z.uuid() }).strict();

export const listQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(100) })
  .strict();
