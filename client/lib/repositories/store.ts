import { StorePurchase } from "@/models/StorePurchase";
import { connect, isDuplicateKeyError } from "./shared";

export async function listOwnedItemIds(userId: string): Promise<string[]> {
  await connect();
  const rows = await StorePurchase.find({ userId }).select("itemId").lean();
  return rows.map((row) => row.itemId);
}

export async function hasPurchased(userId: string, itemId: string): Promise<boolean> {
  await connect();
  return Boolean(await StorePurchase.findOne({ userId, itemId }).lean());
}

/**
 * Record ownership. A unique index on { userId, itemId } makes this idempotent:
 * returns "duplicate" when the user already owns the item (e.g. a concurrent
 * purchase won the race) rather than throwing.
 */
export async function recordPurchase(
  userId: string,
  itemId: string,
  cost: number,
): Promise<"created" | "duplicate"> {
  await connect();
  try {
    await StorePurchase.create({ userId, itemId, cost });
    return "created";
  } catch (err) {
    if (isDuplicateKeyError(err)) return "duplicate";
    throw err;
  }
}
