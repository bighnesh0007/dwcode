/**
 * Store purchases — facade over mongo/store.ts and pg/store.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/store";
import * as p from "./pg/store";
import { read, write } from "./backend";

export const listOwnedItemIds = read("store.listOwnedItemIds", m.listOwnedItemIds, p.listOwnedItemIds);
export const hasPurchased = read("store.hasPurchased", m.hasPurchased, p.hasPurchased);
export const recordPurchase = write("store.recordPurchase", m.recordPurchase, p.recordPurchase);
