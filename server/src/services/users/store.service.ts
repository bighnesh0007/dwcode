/**
 * The coin store. Replaces the Next.js /api/store route with the same rules:
 *  - price comes from the server catalogue, never the request
 *  - the debit is one conditional update (`balance >= cost`), so concurrent
 *    purchases cannot overspend
 *  - the { userId, itemId } unique index makes a purchase idempotent; losing
 *    that race refunds the debit
 */
import { AppError, BadRequestError, NotFoundError } from "../../errors/AppError.ts";
import { ErrorCode } from "../../errors/codes.ts";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { StorePurchaseRepository } from "../../repositories/storePurchase.repository.ts";
import { COSMETICS, STREAK_FREEZES, findCosmetic, findStreakFreeze } from "@dwcode/shared";
import { THEME_SKINS, findSkin } from "./storeCatalog.ts";

const FREE_IDS = [...new Set([...THEME_SKINS, ...COSMETICS].filter((s) => s.cost === 0).map((s) => s.id))];

/** 402 with the price and balance, as the Next.js route returned. */
export class InsufficientCoinsError extends AppError {
  constructor(required: number, balance: number) {
    super({
      code: ErrorCode.UNPROCESSABLE,
      message: "Not enough coins.",
      status: 402,
      expose: true,
      details: { required, balance },
    });
  }
}

/** Admin overrides from the store editor (Phase F): a price change, or an item taken off sale. */
export type StoreOverrides = Record<string, { cost?: number; disabled?: boolean }>;
export const STORE_OVERRIDES_KEY = "store.overrides";
const OVERRIDES_TTL_MS = 30_000;

export interface OverrideSource {
  get(key: string): Promise<unknown>;
}

/** Every item the store can sell, by id: skins, streak freezes and cosmetics. */
export function sellableItems(): { id: string; name: string; cost: number; kind: string }[] {
  const seen = new Set<string>();
  const out: { id: string; name: string; cost: number; kind: string }[] = [];
  for (const [kind, list] of [["skin", THEME_SKINS], ["freeze", STREAK_FREEZES], ["cosmetic", COSMETICS]] as const) {
    for (const i of list) {
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      out.push({ id: i.id, name: i.name, cost: i.cost, kind });
    }
  }
  return out;
}

let overridesCache: { at: number; value: StoreOverrides } | null = null;

/** The store editor calls this after saving, so the new prices apply at once in this process. */
export function invalidateStoreOverrides(): void {
  overridesCache = null;
}

export class StoreService {
  constructor(
    private readonly purchases: StorePurchaseRepository,
    private readonly coins: CoinsRepository,
    private readonly settings?: OverrideSource,
  ) {}

  private async overrides(): Promise<StoreOverrides> {
    if (!this.settings) return {};
    const now = Date.now();
    if (overridesCache && now - overridesCache.at < OVERRIDES_TTL_MS) return overridesCache.value;
    const raw = await this.settings.get(STORE_OVERRIDES_KEY).catch(() => null);
    const value = raw && typeof raw === "object" ? (raw as StoreOverrides) : {};
    overridesCache = { at: now, value };
    return value;
  }

  /** Apply overrides: new prices, and drop items taken off sale (unless already owned). */
  private apply<T extends { id: string; cost: number }>(items: readonly T[], o: StoreOverrides, owned: ReadonlySet<string>): T[] {
    return items
      .filter((i) => !o[i.id]?.disabled || owned.has(i.id))
      .map((i) => (o[i.id]?.cost !== undefined ? { ...i, cost: o[i.id]?.cost ?? i.cost } : i));
  }

  async catalogue(userId: string | undefined) {
    const o = await this.overrides();
    const free = new Set(FREE_IDS);
    if (!userId) {
      return { items: this.apply(THEME_SKINS, o, free), freezes: this.apply(STREAK_FREEZES, o, free), cosmetics: this.apply(COSMETICS, o, free), owned: FREE_IDS, balance: 0, signedIn: false };
    }
    const [bought, balance] = await Promise.all([this.purchases.ownedItemIds(userId), this.coins.balance(userId)]);
    const owned = new Set([...FREE_IDS, ...bought]);
    return {
      items: this.apply(THEME_SKINS, o, owned),
      freezes: this.apply(STREAK_FREEZES, o, owned),
      cosmetics: this.apply(COSMETICS, o, owned),
      owned: [...owned],
      balance,
      signedIn: true,
    };
  }

  async purchase(userId: string, itemId: string) {
    // Skins, streak freezes and cosmetics share the purchase path: priced here, bought once.
    const base = findSkin(itemId) ?? findStreakFreeze(itemId) ?? findCosmetic(itemId);
    if (!base) throw new NotFoundError("Unknown item.");
    const override = (await this.overrides())[base.id];
    if (override?.disabled) throw new NotFoundError("That item is no longer on sale.");
    const item = { id: base.id, name: base.name, cost: override?.cost ?? base.cost };
    if (item.cost === 0) throw new BadRequestError("That item is already free.");

    if (await this.purchases.owns(userId, item.id)) {
      return { success: true, alreadyOwned: true, itemId: item.id, balance: await this.coins.balance(userId) };
    }

    const balance = await this.coins.debitIfSufficient(userId, item.cost, "store_purchase", `Purchased ${item.name}`);
    if (balance === null) throw new InsufficientCoinsError(item.cost, await this.coins.balance(userId));

    if ((await this.purchases.record(userId, item.id, item.cost)) === "duplicate") {
      // A concurrent purchase of the same item recorded first: refund ours.
      await this.coins.award(userId, item.cost, "store_refund", `Refund — ${item.name} already owned`);
      return { success: true, alreadyOwned: true, itemId: item.id, balance: await this.coins.balance(userId) };
    }
    return { success: true, itemId: item.id, balance };
  }
}
