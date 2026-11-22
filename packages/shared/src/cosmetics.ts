/**
 * Cosmetics (SFCode parity, Phase E): store items in slots, with rarities,
 * that a learner equips. The accent slot is the existing theme skins; the
 * others are new. Prices live here so the server charges what the store
 * shows, as with skins. A `token` is what the client renders: a CSS class
 * for frames and banners, an emoji for badges, a Monaco theme for editors,
 * the skin id for accents.
 */
import { THEME_SKINS, type ThemeSkin } from "./store.js";

export const COSMETIC_SLOTS = [
  { id: "accent", label: "Accent colour" },
  { id: "frame", label: "Avatar frame" },
  { id: "badge", label: "Profile badge" },
  { id: "banner", label: "Profile banner" },
  { id: "editor", label: "Editor theme" },
] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number]["id"];

export const RARITIES = [
  { id: "common", label: "Common", className: "text-muted-foreground border-border" },
  { id: "rare", label: "Rare", className: "text-sky-600 border-sky-500/40 dark:text-sky-400" },
  { id: "epic", label: "Epic", className: "text-violet-600 border-violet-500/40 dark:text-violet-400" },
  { id: "legendary", label: "Legendary", className: "text-amber-600 border-amber-500/50 dark:text-amber-400" },
] as const;
export type Rarity = (typeof RARITIES)[number]["id"];

export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  cost: number;
  rarity: Rarity;
  token: string;
}

const SKIN_RARITY: Record<ThemeSkin["category"], Rarity> = { Free: "common", Classic: "rare", Vivid: "epic", Premium: "legendary" };

const ACCENTS: Cosmetic[] = THEME_SKINS.map((s) => ({
  id: s.id, slot: "accent", name: s.name, description: s.description, cost: s.cost, rarity: SKIN_RARITY[s.category], token: s.id,
}));

const OTHERS: Cosmetic[] = [
  { id: "frame-none", slot: "frame", name: "No frame", description: "Just your avatar.", cost: 0, rarity: "common", token: "" },
  { id: "frame-silver", slot: "frame", name: "Silver ring", description: "A clean silver ring.", cost: 60, rarity: "rare", token: "ring-2 ring-slate-300" },
  { id: "frame-cyan", slot: "frame", name: "Mule cyan", description: "A bright cyan ring.", cost: 90, rarity: "rare", token: "ring-2 ring-cyan-400" },
  { id: "frame-violet", slot: "frame", name: "Violet glow", description: "A double violet ring.", cost: 150, rarity: "epic", token: "ring-4 ring-violet-500/70" },
  { id: "frame-gold", slot: "frame", name: "Gold crown", description: "A thick gold ring for the dedicated.", cost: 300, rarity: "legendary", token: "ring-4 ring-amber-400" },

  { id: "badge-none", slot: "badge", name: "No badge", description: "Nothing next to your name.", cost: 0, rarity: "common", token: "" },
  { id: "badge-arrow", slot: "badge", name: "Arrow", description: "The DataWeave lambda arrow.", cost: 40, rarity: "common", token: "➜" },
  { id: "badge-bolt", slot: "badge", name: "Bolt", description: "For fast solvers.", cost: 80, rarity: "rare", token: "⚡" },
  { id: "badge-gem", slot: "badge", name: "Gem", description: "A polished gem.", cost: 160, rarity: "epic", token: "💎" },
  { id: "badge-crown", slot: "badge", name: "Crown", description: "Royalty.", cost: 320, rarity: "legendary", token: "👑" },

  { id: "banner-none", slot: "banner", name: "Plain", description: "No banner.", cost: 0, rarity: "common", token: "" },
  { id: "banner-dusk", slot: "banner", name: "Dusk", description: "Indigo into violet.", cost: 70, rarity: "rare", token: "bg-gradient-to-r from-indigo-500/30 to-violet-500/30" },
  { id: "banner-ocean", slot: "banner", name: "Ocean", description: "Cyan into blue.", cost: 70, rarity: "rare", token: "bg-gradient-to-r from-cyan-500/30 to-blue-600/30" },
  { id: "banner-ember", slot: "banner", name: "Ember", description: "Amber into rose.", cost: 140, rarity: "epic", token: "bg-gradient-to-r from-amber-500/30 to-rose-500/30" },
  { id: "banner-aurora", slot: "banner", name: "Aurora", description: "Green, cyan and violet.", cost: 280, rarity: "legendary", token: "bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-violet-500/30" },

  { id: "editor-auto", slot: "editor", name: "Match the site", description: "Light or dark, following the site.", cost: 0, rarity: "common", token: "" },
  { id: "editor-contrast-dark", slot: "editor", name: "High contrast dark", description: "Maximum contrast, dark.", cost: 50, rarity: "rare", token: "hc-black" },
  { id: "editor-contrast-light", slot: "editor", name: "High contrast light", description: "Maximum contrast, light.", cost: 50, rarity: "rare", token: "hc-light" },
];

export const COSMETICS: readonly Cosmetic[] = [...ACCENTS, ...OTHERS];

export function findCosmetic(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id);
}

export function rarityOf(id: Rarity) {
  return RARITIES.find((r) => r.id === id) ?? RARITIES[0];
}

/** Slot → equipped item id. Missing slots use the free default. */
export type Equipped = Partial<Record<CosmeticSlot, string>>;

/** Resolve equipped ids to items, dropping any that are unknown or in the wrong slot. */
export function equippedItems(equipped: Equipped): Partial<Record<CosmeticSlot, Cosmetic>> {
  const out: Partial<Record<CosmeticSlot, Cosmetic>> = {};
  for (const slot of COSMETIC_SLOTS) {
    const item = equipped[slot.id] ? findCosmetic(equipped[slot.id] as string) : undefined;
    if (item?.slot === slot.id) out[slot.id] = item;
  }
  return out;
}

// ── Profiles, mentors, jobs ─────────────────────────────────────────────────

export const PROFILE_LIMITS = { headline: 80, about: 2000, mentorTopics: 6, mentorMessage: 1000 } as const;
/** Mentoring requests a learner may send per UTC day. */
export const MENTOR_ASKS_PER_DAY = 5;
/** Days a job posting stays listed after approval. */
export const JOB_LISTING_DAYS = 60;
