import { z } from "zod";

const hexId = z.string().regex(/^[0-9a-f]{24}$/i);

/** Mark the given notifications read, or all of them when `ids` is omitted. */
export const markReadSchema = z.object({ ids: z.array(hexId).max(100).optional() }).strict();
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const announcementSchema = z
  .object({
    message: z.string().max(300),
    level: z.enum(["info", "success", "warning"]).default("info"),
    link: z.string().max(300).optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export type AnnouncementInput = z.infer<typeof announcementSchema>;
