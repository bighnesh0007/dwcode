import { z } from "zod";
import { DIFFICULTY_ENUM, DRAFT_CASES, LIMITS } from "@dwcode/shared";
import { EXAM } from "../services/learning/content.ts";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be an ObjectId");

/** A problem draft: case inputs only — expected outputs come from running the solution. */
export const problemDraftSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    difficulty: z.enum(DIFFICULTY_ENUM as [string, ...string[]]),
    category: z.string().trim().min(1).max(60),
    description: z.string().trim().min(20).max(LIMITS.note.maxLength),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    starterCode: z.string().max(LIMITS.code.maxLength).default(""),
    solution: z.string().min(1).max(LIMITS.code.maxLength),
    cases: z
      .array(z.object({ input: z.string().max(LIMITS.playground.maxFileLength), hidden: z.boolean() }).strict())
      .min(DRAFT_CASES.min)
      .max(DRAFT_CASES.max)
      .refine((cs) => cs.some((c) => !c.hidden), "At least one case must be visible."),
    hints: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
  })
  .strict();
export type ProblemDraft = z.infer<typeof problemDraftSchema>;

/** An original certification question. */
export const questionDraftSchema = z
  .object({
    section: z.enum(EXAM.sections.map((s) => s.id) as [string, ...string[]]),
    prompt: z.string().trim().min(10).max(1000),
    options: z
      .array(z.string().trim().min(1).max(300))
      .min(2)
      .max(6)
      .refine((o) => new Set(o).size === o.length, "Options must be different."),
    answer: z.number().int().min(0).max(5),
    explanation: z.string().trim().min(10).max(1000),
  })
  .strict()
  .refine((q) => q.answer < q.options.length, { message: "The answer must be one of the options.", path: ["answer"] });
export type QuestionDraft = z.infer<typeof questionDraftSchema>;

export const applicationSchema = z
  .object({
    experience: z.string().trim().min(20).max(2000),
    link: z.url().max(300).optional(),
  })
  .strict();
export type ApplicationDraft = z.infer<typeof applicationSchema>;

export const createContributionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("problem"), payload: problemDraftSchema }).strict(),
  z.object({ kind: z.literal("question"), payload: questionDraftSchema }).strict(),
  z.object({ kind: z.literal("application"), payload: applicationSchema }).strict(),
]);
export type CreateContributionInput = z.infer<typeof createContributionSchema>;

/** The payload is re-validated against the stored kind in the service. */
export const updateContributionSchema = z.object({ payload: z.record(z.string(), z.unknown()) }).strict();
export type UpdateContributionInput = z.infer<typeof updateContributionSchema>;

export const contributionParamsSchema = z.object({ id: objectId }).strict();

export const reviewSchema = z.object({ note: z.string().trim().max(1000).default("") }).strict();
export type ReviewInput = z.infer<typeof reviewSchema>;

export const queueQuerySchema = z
  .object({ kind: z.enum(["problem", "question", "application"]).optional() })
  .strict();
