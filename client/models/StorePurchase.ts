import mongoose from "mongoose";
import { modelFromSchema } from "./model";

/**
 * A completed store purchase — the ownership record for a paid item.
 *
 * The compound unique index on { userId, itemId } is what makes buying idempotent:
 * a double-click or a retried request cannot charge twice, because the second insert
 * fails with a duplicate-key error instead of debiting again.
 */
export const StorePurchaseSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    itemId: { type: String, required: true },
    /** Coins actually charged, recorded for auditing and refunds. */
    cost: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
});

StorePurchaseSchema.index({ userId: 1, itemId: 1 }, { unique: true });

export const StorePurchase = modelFromSchema("StorePurchase", StorePurchaseSchema);
