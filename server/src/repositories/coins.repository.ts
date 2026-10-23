/** Coin ledger. Same update the Next.js `awardCoins` performed. */
import { UserCoins } from "../models/UserCoins.ts";

export interface CoinTransactionView {
  type: string;
  amount: number;
  description: string;
  createdAt: Date;
}

function ledgerEntry(type: string, amount: number, description: string) {
  return {
    $each: [{ type, amount, description, createdAt: new Date() }],
    $position: 0, // newest first
    $slice: 200, // keep the last 200
  };
}

export class CoinsRepository {
  async award(userId: string, amount: number, type: string, description: string): Promise<void> {
    if (!userId || amount === 0) return;
    await UserCoins.findOneAndUpdate(
      { userId },
      {
        $inc: { balance: amount },
        $push: { transactions: ledgerEntry(type, amount, description) },
      },
      { upsert: true },
    );
  }

  async balance(userId: string): Promise<number> {
    const doc = await UserCoins.findOne({ userId }).select("balance").lean();
    return doc?.balance ?? 0;
  }

  /** Balance plus the newest `limit` ledger entries. */
  async summary(userId: string, limit: number): Promise<{ balance: number; transactions: CoinTransactionView[] }> {
    const doc = await UserCoins.findOne({ userId }).lean();
    return {
      balance: doc?.balance ?? 0,
      transactions: (doc?.transactions ?? []).slice(0, limit).map((t) => ({
        type: t.type,
        amount: t.amount,
        description: t.description ?? "",
        createdAt: t.createdAt ?? new Date(0),
      })),
    };
  }

  /**
   * Atomic conditional debit: one findOneAndUpdate guarded by `balance >= amount`,
   * so two concurrent debits cannot both pass against the same balance.
   * Returns the new balance, or null when the balance is short (nothing changed).
   */
  async debitIfSufficient(userId: string, amount: number, type: string, description: string): Promise<number | null> {
    const doc = await UserCoins.findOneAndUpdate(
      { userId, balance: { $gte: amount } },
      {
        $inc: { balance: -amount },
        $push: { transactions: ledgerEntry(type, -amount, description) },
      },
      { returnDocument: "after" },
    ).lean();
    return doc ? (doc.balance ?? 0) : null;
  }
}
