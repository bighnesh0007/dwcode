import { LEARNER_GOALS, LEARNER_LEVELS, LEARNER_ROLES, WEEKLY_HOURS } from "@dwcode/shared";
import { z } from "zod";

const id = z.string().min(1).max(80).regex(/^[a-z0-9-]+$/);

/** Question id → chosen option index. */
const answers = z.record(id, z.number().int().min(0).max(9)).refine((a) => Object.keys(a).length <= 200, "Too many answers.");

export const onboardingSchema = z
  .object({
    role: z.enum(LEARNER_ROLES),
    level: z.enum(LEARNER_LEVELS),
    goal: z.enum(LEARNER_GOALS),
    hours: z.enum(WEEKLY_HOURS),
    roadmapId: id.optional(),
  })
  .strict();
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const answersSchema = z.object({ answers }).strict();
export type AnswersInput = z.infer<typeof answersSchema>;

export const roadmapParamsSchema = z.object({ id }).strict();
export const stepParamsSchema = z.object({ id, stepId: id }).strict();
export const questionParamsSchema = z.object({ id }).strict();

export const gradeMockSchema = z.object({ seed: z.number().int().min(1).max(2 ** 31), answers }).strict();
export type GradeMockInput = z.infer<typeof gradeMockSchema>;

export const reviewAnswerSchema = z.object({ answer: z.number().int().min(0).max(9) }).strict();
export type ReviewAnswerInput = z.infer<typeof reviewAnswerSchema>;
