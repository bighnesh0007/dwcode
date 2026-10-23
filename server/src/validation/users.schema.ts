import { z } from "zod";

/** Same rule as the Next.js route: 3–20 chars, letters, digits, underscore. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const USERNAME_MESSAGE = "Invalid username. Must be 3-20 characters, alphanumeric and underscores only.";

export const updateIdentitySchema = z
  .object({
    username: z.string().regex(USERNAME_PATTERN, USERNAME_MESSAGE),
    // The old route had no cap; 500 keeps a bio a bio.
    bio: z.string().max(500).optional(),
  })
  .strict();
export type UpdateIdentityInput = z.infer<typeof updateIdentitySchema>;

export const followSchema = z.object({ targetUsername: z.string().trim().min(1, "Missing target username").max(100) }).strict();
export type FollowInput = z.infer<typeof followSchema>;

/** Setup takes no input; an empty or absent body only. */
export const emptyBodySchema = z.object({}).strict().optional();

export const usernameParamsSchema = z.object({ username: z.string().min(1).max(100) }).strict();

export const purchaseSchema = z.object({ itemId: z.string().min(1).max(100) }).strict();
export type PurchaseInput = z.infer<typeof purchaseSchema>;

/** Lenient like the old route: bad values fall back to defaults instead of 400. */
export const leaderboardQuerySchema = z.object({
  page: z.coerce.number().int().positive().catch(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .catch(25)
    .default(25)
    .transform((n) => Math.min(100, Math.max(5, n))),
  sort: z.enum(["score", "solved", "acceptance"]).catch("score").default("score"),
});
