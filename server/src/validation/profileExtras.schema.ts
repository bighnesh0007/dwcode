import { COSMETIC_SLOTS, EMAIL_CATEGORIES, PROFILE_LIMITS } from "@dwcode/shared";
import { z } from "zod";

const LINK_KEYS = ["website", "github", "linkedin"] as const;
const httpsUrl = z.url({ protocol: /^https?$/ }).max(300);

export const aboutSchema = z
  .object({
    headline: z.string().trim().max(PROFILE_LIMITS.headline).default(""),
    about: z.string().trim().max(PROFILE_LIMITS.about).default(""),
    links: z.partialRecord(z.enum(LINK_KEYS), httpsUrl).default({}),
  })
  .strict();
export type AboutBody = z.infer<typeof aboutSchema>;

export const equipSchema = z
  .object({ slot: z.enum(COSMETIC_SLOTS.map((s) => s.id) as [string, ...string[]]), itemId: z.string().min(1).max(60) })
  .strict();
export type EquipBody = z.infer<typeof equipSchema>;

export const mentorSchema = z
  .object({
    active: z.boolean(),
    topics: z.array(z.string().trim().min(2).max(40)).max(PROFILE_LIMITS.mentorTopics).default([]),
    note: z.string().trim().max(500).default(""),
  })
  .strict();
export type MentorBody = z.infer<typeof mentorSchema>;

export const askSchema = z.object({ message: z.string().trim().min(10).max(PROFILE_LIMITS.mentorMessage) }).strict();
export type AskBody = z.infer<typeof askSchema>;

export const emailPrefsSchema = z
  .object({ prefs: z.partialRecord(z.enum(EMAIL_CATEGORIES.map((c) => c.id) as [string, ...string[]]), z.boolean()) })
  .strict();
export type EmailPrefsBody = z.infer<typeof emailPrefsSchema>;

export const usernameParamSchema = z.object({ username: z.string().min(1).max(60) }).strict();
