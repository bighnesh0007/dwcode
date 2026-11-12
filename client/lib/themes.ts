/**
 * Purchasable theme catalogue — the data lives in @dwcode/shared (the server
 * charges from the same prices). This module adds the browser-only bits.
 */
export { DEFAULT_SKIN, THEME_SKINS, SKIN_IDS, findSkin, isFreeSkin } from "@dwcode/shared";
export type { ThemeSkin } from "@dwcode/shared";

export const LS_ACTIVE_SKIN = "dwcode_active_skin";
