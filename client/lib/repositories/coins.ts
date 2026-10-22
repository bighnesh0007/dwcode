import { UserCoins } from "@/models/UserCoins";
import { connect } from "./shared";

/** Only the newest transactions are kept on the ledger. */
const LEDGER_LIMIT = 200;

export interface CoinTransaction {
  type: string;
  amount: number;
  description: string;
}

/** Prepend a transaction and trim the ledger to its newest entries. */
function ledgerPush(tx: CoinTransaction) {
  return {
    transactions: {
      $each: [{ ...tx, createdAt: new Date() }],
      $position: 0,
      $slice: LEDGER_LIMIT,
    },
  };
}

/** Balance and ledger (newest first). Zero and empty when the user has none yet. */
export async function getWallet(userId: string) {
  await connect();
  const doc = await UserCoins.findOne({ userId }).lean();
  return { balance: doc?.balance ?? 0, transactions: doc?.transactions ?? [] };
}

export async function getBalance(userId: string): Promise<number> {
  await connect();
  const doc = await UserCoins.findOne({ userId }).select("balance").lean();
  return doc?.balance ?? 0;
}

/** Every user's balance — for the admin directory. */
export async function listBalances() {
  await connect();
  return UserCoins.find().select("userId balance").lean();
}

/** Add `tx.amount` (may be negative) and record it. Creates the wallet if needed. */
export async function credit(userId: string, tx: CoinTransaction) {
  await connect();
  await UserCoins.findOneAndUpdate(
    { userId },
    { $inc: { balance: tx.amount }, $push: ledgerPush(tx) },
    { upsert: true },
  );
}

/**
 * Debit `cost` only if the balance covers it, in one atomic conditional update,
 * so two concurrent purchases cannot both spend the same coins.
 *
 * Returns the new balance, or null when the balance was too low.
 */
export async function debitIfAffordable(
  userId: string,
  cost: number,
  tx: Omit<CoinTransaction, "amount">,
): Promise<number | null> {
  await connect();
  const doc = await UserCoins.findOneAndUpdate(
    { userId, balance: { $gte: cost } },
    { $inc: { balance: -cost }, $push: ledgerPush({ ...tx, amount: -cost }) },
    { returnDocument: "after" },
  );
  return doc ? doc.balance : null;
}
