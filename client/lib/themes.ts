/**
 * Purchasable theme catalogue.
 *
 * Design decision: a theme is an ACCENT SKIN, not a full palette replacement. Each
 * skin overrides --primary / --accent / --ring / --chart-*, while --background and
 * --foreground stay under the control of next-themes (light/dark). That guarantees a
 * purchased theme can never produce unreadable text — the failure mode you would
 * otherwise get from letting users buy arbitrary colour schemes.
 *
 * The CSS lives in app/globals.css under [data-skin="<id>"] selectors. Adding a theme
 * means adding an entry here AND the matching CSS block.
 */

export const DEFAULT_SKIN = "default";

export interface ThemeSkin {
    id: string;
    name: string;
    description: string;
    /** Price in coins. 0 = free / owned by everyone. */
    cost: number;
    /** Small swatch shown on the store card: [primary, accent, surface]. */
    swatch: [string, string, string];
    category: "Free" | "Classic" | "Vivid" | "Premium";
}

export const THEME_SKINS: ThemeSkin[] = [
    {
        id: DEFAULT_SKIN,
        name: "DWCode Violet",
        description: "The original violet accent. Always available.",
        cost: 0,
        swatch: ["#7c5cff", "#a394ff", "#1a1625"],
        category: "Free",
    },
    {
        id: "midnight-mule",
        name: "Midnight Mule",
        description: "Deep navy and MuleSoft cyan. Calm, high-contrast, built for long sessions.",
        cost: 120,
        swatch: ["#00a0df", "#00c9d6", "#061a3a"],
        category: "Classic",
    },
    {
        id: "mono-slate",
        name: "Mono Slate",
        description: "Grayscale and understated. No colour distractions, just code.",
        cost: 80,
        swatch: ["#8a8f98", "#b8bec7", "#1c1f24"],
        category: "Classic",
    },
    {
        id: "forest",
        name: "Evergreen",
        description: "Muted greens with a warm neutral base.",
        cost: 100,
        swatch: ["#2fa36b", "#57c98d", "#14201a"],
        category: "Vivid",
    },
    {
        id: "solar-flare",
        name: "Solar Flare",
        description: "Warm amber and ember tones for late-night transformations.",
        cost: 150,
        swatch: ["#f59e0b", "#fbbf24", "#241a0d"],
        category: "Vivid",
    },
    {
        id: "rose-quartz",
        name: "Rose Quartz",
        description: "Soft magenta and plum. Distinctive without shouting.",
        cost: 200,
        swatch: ["#e0559b", "#f08fc0", "#251320"],
        category: "Premium",
    },
    {
        id: "terminal-green",
        name: "Terminal",
        description: "Phosphor green on near-black. For the purists.",
        cost: 250,
        swatch: ["#34d399", "#6ee7b7", "#0b1210"],
        category: "Premium",
    },
];

export const SKIN_IDS = THEME_SKINS.map((t) => t.id);

export function findSkin(id: string): ThemeSkin | undefined {
    return THEME_SKINS.find((t) => t.id === id);
}

/** A skin is free if its cost is 0. */
export function isFreeSkin(id: string): boolean {
    return findSkin(id)?.cost === 0;
}

export const LS_ACTIVE_SKIN = "dwcode_active_skin";
