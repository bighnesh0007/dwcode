import { z } from "zod";

export const connectQuerySchema = z.object({ returnTo: z.string().max(512).optional() }).strict();

/** GitHub sends `error`/`error_description` instead of `code` when the user cancels. */
export const callbackQuerySchema = z
  .object({
    code: z.string().max(200).optional(),
    state: z.string().max(2000).optional(),
    error: z.string().max(200).optional(),
    error_description: z.string().max(1000).optional(),
    error_uri: z.string().max(1000).optional(),
  });
// Not .strict(): this is GitHub's redirect, not our client, and an extra
// parameter must not turn the user's sign-in into a JSON error page.
