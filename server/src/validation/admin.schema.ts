import { z } from "zod";

const clerkUserId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, "invalid user id");

export const grantRoleSchema = z
  .object({
    targetUserId: clerkUserId,
    targetUserName: z.string().trim().max(200).default(""),
  })
  .strict();

export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

export const roleParamsSchema = z.object({ userId: clerkUserId }).strict();
