import { z } from "zod";

export const contestIdParamsSchema = z.object({ id: z.string().min(1).max(64) }).strict();
export const teamSlugParamsSchema = z.object({ slug: z.string().min(1).max(64) }).strict();
export const usernameParamsSchema = z.object({ username: z.string().min(1).max(100) }).strict();

export const createTeamSchema = z.object({ name: z.string().max(80), listed: z.boolean().default(true) }).strict();
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const joinTeamSchema = z.object({ code: z.string().min(4).max(20) }).strict();
export type JoinTeamInput = z.infer<typeof joinTeamSchema>;

export const removeMemberSchema = z.object({ userId: z.string().min(1).max(200) }).strict();
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

export const listedSchema = z.object({ listed: z.boolean() }).strict();
export type ListedInput = z.infer<typeof listedSchema>;

export const countrySchema = z.object({ country: z.string().length(2).toUpperCase().nullable() }).strict();
export type CountryInput = z.infer<typeof countrySchema>;
