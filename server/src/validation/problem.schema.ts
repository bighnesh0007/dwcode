import { z } from "zod";
import { DIFFICULTY_ENUM, LIMITS } from "@dwcode/shared";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS, REPORT_STATUSES } from "../models/ProblemReport.ts";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be an ObjectId");
const difficulty = z.enum(DIFFICULTY_ENUM as [string, ...string[]]);

const testCase = z.object({ input: z.string().max(LIMITS.playground.maxFileLength), expectedOutput: z.string().max(LIMITS.playground.maxFileLength) }).strict();
const example = z
  .object({
    input: z.string().max(LIMITS.playground.maxFileLength),
    output: z.string().max(LIMITS.playground.maxFileLength),
    explanation: z.string().max(5000).optional(),
  })
  .strict();
const shortList = z.array(z.string().max(2000)).max(50);

/** Every author-editable field. Provenance (createdBy, createdByAI, createdAt) and slug are server-owned. */
const problemFields = {
  title: z.string().trim().min(1, "title is required").max(200),
  difficulty,
  category: z.string().trim().min(1).max(60),
  tags: z.array(z.string().max(60)).max(30),
  description: z.string().min(1).max(LIMITS.note.maxLength),
  examples: z.array(example).max(20),
  constraints: shortList,
  starterCode: z.string().max(LIMITS.code.maxLength),
  testCases: z.array(testCase).max(50),
  hiddenTestCases: z.array(testCase).max(50),
  solution: z.string().max(LIMITS.code.maxLength),
  hints: shortList,
};

export const createProblemSchema = z
  .object({
    ...problemFields,
    tags: problemFields.tags.optional(),
    examples: problemFields.examples.optional(),
    constraints: problemFields.constraints.optional(),
    starterCode: problemFields.starterCode.optional(),
    testCases: problemFields.testCases.optional(),
    hiddenTestCases: problemFields.hiddenTestCases.optional(),
    solution: problemFields.solution.optional(),
    hints: problemFields.hints.optional(),
  })
  .strict();
export type CreateProblemInput = z.infer<typeof createProblemSchema>;

export const updateProblemSchema = z
  .object(problemFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "No updatable fields supplied");
export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;

export const problemIdParamsSchema = z.object({ id: objectId }).strict();
/** GET accepts an ObjectId or a slug, as the Next route did. */
export const problemKeyParamsSchema = z.object({ id: z.string().min(1).max(200) }).strict();

export const listProblemsQuerySchema = z
  .object({
    difficulty: z.string().max(60).optional(),
    category: z.string().max(60).optional(),
  })
  .strict();

export const mineQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(LIMITS.pagination.maxLimit).default(LIMITS.pagination.defaultLimit) })
  .strict();

/** Look-up by many keys — a POST so a long slug list cannot overflow the URL. */
export const summariesSchema = z
  .object({
    ids: z.array(objectId).max(1000).optional(),
    slugs: z.array(z.string().min(1).max(200)).max(1000).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .strict();
export type SummariesInput = z.infer<typeof summariesSchema>;

// ── Reports ──────────────────────────────────────────────────────────────────
export const createReportSchema = z
  .object({
    problemId: objectId,
    reason: z.enum(REPORT_REASONS),
    // Trimmed and capped rather than rejected, as the Next route did.
    details: z.string().optional().transform((v) => (v ?? "").trim().slice(0, REPORT_DETAILS_MAX_LENGTH)),
  })
  .strict();
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const mineReportQuerySchema = z.object({ problemId: objectId }).strict();
export const listReportsQuerySchema = z.object({ status: z.enum(REPORT_STATUSES) }).strict();

export const updateReportSchema = z
  .object({
    status: z.enum(REPORT_STATUSES),
    resolutionNote: z.string().optional().transform((v) => (v ?? "").trim().slice(0, REPORT_DETAILS_MAX_LENGTH)),
  })
  .strict();
export type UpdateReportInput = z.infer<typeof updateReportSchema>;

// ── Generation ───────────────────────────────────────────────────────────────
const generationFields = {
  difficulty: difficulty.optional(),
  category: z.string().trim().max(60).optional(),
  // Free text that lands inside the prompt (finding M-2): sanitised in the service.
  topic: z.string().max(500).optional(),
};

export const generateSchema = z.object(generationFields).strict();
export type GenerateInput = z.infer<typeof generateSchema>;

export const generatePublicSchema = z
  .object({ ...generationFields, geminiApiKey: z.string().trim().min(1, "Gemini API key is required").max(200) })
  .strict();
export type GeneratePublicInput = z.infer<typeof generatePublicSchema>;

/**
 * What the model must return. Model output is untrusted input: anything that
 * does not fit is a 502, never a document in the problem bank (SEC-15).
 */
export const generatedProblemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().min(1).max(LIMITS.note.maxLength),
  tags: z.array(z.string().max(60)).max(30).default([]),
  examples: z
    .array(z.object({ input: z.string(), output: z.string(), explanation: z.string().optional() }))
    .max(20)
    .default([]),
  constraints: shortList.default([]),
  starterCode: z.string().max(LIMITS.code.maxLength).optional(),
  testCases: z.array(z.object({ input: z.string(), expectedOutput: z.string() })).max(50).default([]),
  hiddenTestCases: z.array(z.object({ input: z.string(), expectedOutput: z.string() })).max(50).default([]),
  solution: z.string().max(LIMITS.code.maxLength).optional(),
  hints: shortList.default([]),
});
export type GeneratedProblem = z.infer<typeof generatedProblemSchema>;
