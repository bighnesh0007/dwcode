import type { Cosmetic, CosmeticSlot } from "@dwcode/shared";

/** GET /api/v1/profile-details/u/:username */
export interface PublicDetails {
  username: string;
  headline: string;
  about: string;
  links: Partial<Record<"website" | "github" | "linkedin", string>>;
  equipped: Partial<Record<CosmeticSlot, Cosmetic>>;
  mentor: { topics: string[]; note: string } | null;
  skills: { category: string; solved: number; total: number }[];
}

/** GET /api/v1/profile-details/me */
export interface MyDetails {
  headline: string;
  about: string;
  links: Partial<Record<"website" | "github" | "linkedin", string>>;
  equipped: Partial<Record<CosmeticSlot, string>>;
  equippedItems: Partial<Record<CosmeticSlot, Cosmetic>>;
  mentorActive: boolean;
  mentorTopics: string[];
  mentorNote: string;
  owned: string[];
}

/** Only http(s) links are rendered; the server validates the same. */
export function safeHref(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
