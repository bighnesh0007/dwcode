import { z } from "zod";

export const startInterviewSchema = z.object({ preset: z.string().min(1).max(40) }).strict();
export type StartInterviewInput = z.infer<typeof startInterviewSchema>;

export const sizeParamsSchema = z.object({ slug: z.string().min(1).max(200) }).strict();

export const explainSchema = z
  .object({ code: z.string().min(1).max(64 * 1024), error: z.string().min(1).max(16 * 1024) })
  .strict();
export type ExplainInput = z.infer<typeof explainSchema>;
