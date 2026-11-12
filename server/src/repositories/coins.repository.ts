/** Coin ledger. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as coins from "../data/repositories/coins.ts";

export interface CoinTransactionView {
  type: string;
  amount: number;
  description: string;
  createdAt: Date;
}

export class CoinsRepository {
  async award(userId: string, amount: number, type: string, description: string): Promise<void> {
    if (!userId || amount === 0) return;
    await coins.credit(userId, { type, amount, description });
  }

  balance(userId: string): Promise<number> {
    return coins.getBalance(userId);
  }

  /** Balance plus the newest `limit` ledger entries. */
  async summary(userId: string, limit: number): Promise<{ balance: number; transactions: CoinTransactionView[] }> {
    const wallet = await coins.getWallet(userId);
    return {
      balance: wallet.balance,
      transactions: wallet.transactions.slice(0, limit).map((t) => ({
        type: t.type,
        amount: t.amount,
        description: t.description ?? "",
        createdAt: t.createdAt ?? new Date(0),
      })),
    };
  }

  /**
   * Atomic conditional debit guarded by `balance >= amount`, so two concurrent
   * debits cannot both pass against the same balance. Returns the new balance,
   * or null when the balance is short (nothing changed).
   */
  debitIfSufficient(userId: string, amount: number, type: string, description: string): Promise<number | null> {
    return coins.debitIfAffordable(userId, amount, { type, description });
  }
}
