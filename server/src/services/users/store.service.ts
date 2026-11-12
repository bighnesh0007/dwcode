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
import { THEME_SKINS, findSkin } from "./storeCatalog.ts";

const FREE_IDS = THEME_SKINS.filter((s) => s.cost === 0).map((s) => s.id);

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

export class StoreService {
  constructor(
    private readonly purchases: StorePurchaseRepository,
    private readonly coins: CoinsRepository,
  ) {}

  async catalogue(userId: string | undefined) {
    if (!userId) return { items: THEME_SKINS, owned: FREE_IDS, balance: 0, signedIn: false };
    const [bought, balance] = await Promise.all([this.purchases.ownedItemIds(userId), this.coins.balance(userId)]);
    return { items: THEME_SKINS, owned: [...new Set([...FREE_IDS, ...bought])], balance, signedIn: true };
  }

  async purchase(userId: string, itemId: string) {
    const item = findSkin(itemId);
    if (!item) throw new NotFoundError("Unknown item.");
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
