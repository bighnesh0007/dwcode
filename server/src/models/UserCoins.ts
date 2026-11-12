import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/** Ported from client/models/UserCoins.ts — keep identical while both apps write it. */
const TransactionSchema = new mongoose.Schema({
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  description: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

export const UserCoinsSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  transactions: [TransactionSchema],
});

export const UserCoins = modelFromSchema("UserCoins", UserCoinsSchema);
