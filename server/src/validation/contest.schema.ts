import { z } from "zod";
import { WEEKLY_CONTEST } from "../config/constants.ts";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be an ObjectId");

/**
 * `.strict()`: a body carrying `participants`, `score`, `createdBy`, `inviteCode`
 * or any other server-owned field is rejected rather than silently ignored.
 */
export const createContestSchema = z
  .object({
    title: z.string().trim().min(1, "title is required").max(200),
    description: z.string().max(5000).optional(),
    problemIds: z.array(objectId).min(1, "at least one problem is required").max(50),
    startTime: z.coerce.date(),
    /** Minutes. Upper bound: one week. */
    duration: z.number().int().min(1).max(7 * 24 * 60),
    isPublic: z.boolean().optional(),
    /** Capped at the weekly contest's ceiling — no contest may be bigger than that. */
    maxParticipants: z.number().int().min(1).max(WEEKLY_CONTEST.maxParticipants).optional(),
  })
  .strict();
export type CreateContestInput = z.infer<typeof createContestSchema>;

export const joinByCodeSchema = z
  .object({ inviteCode: z.string().trim().min(1, "Enter an invite key.").max(32) })
  .strict();
export type JoinByCodeInput = z.infer<typeof joinByCodeSchema>;

export const contestParamsSchema = z.object({ id: objectId }).strict();
