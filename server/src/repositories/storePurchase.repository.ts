/** Store ownership rows. */
import { StorePurchase } from "../models/StorePurchase.ts";

export class StorePurchaseRepository {
  async ownedItemIds(userId: string): Promise<string[]> {
    const rows = await StorePurchase.find({ userId }).select("itemId").lean();
    return rows.map((r) => r.itemId);
  }

  async owns(userId: string, itemId: string): Promise<boolean> {
    return (await StorePurchase.exists({ userId, itemId })) !== null;
  }

  /** Throws a Mongo duplicate-key error (code 11000) when already owned. */
  async record(userId: string, itemId: string, cost: number): Promise<void> {
    await StorePurchase.create({ userId, itemId, cost });
  }
}
