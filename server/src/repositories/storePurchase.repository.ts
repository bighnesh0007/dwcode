/** Store ownership rows. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as store from "../data/repositories/store.ts";

export class StorePurchaseRepository {
  ownedItemIds(userId: string): Promise<string[]> {
    return store.listOwnedItemIds(userId);
  }

  owns(userId: string, itemId: string): Promise<boolean> {
    return store.hasPurchased(userId, itemId);
  }

  /** "duplicate" when the user already owns the item (a concurrent purchase won). */
  record(userId: string, itemId: string, cost: number): Promise<"created" | "duplicate"> {
    return store.recordPurchase(userId, itemId, cost);
  }
}
