import { and, desc, eq, gte, sql } from "drizzle-orm";
import { coinTransactions, userBalances } from "@/db/postgres/schema";
import type { CoinTransaction } from "../mongo/coins";
import { db } from "./db";

/** Mongo kept the newest 200 entries; Postgres keeps all and returns as many. */
const LEDGER_LIMIT = 200;

export async function getWallet(userId: string) {
  const [balance, transactions] = await Promise.all([
    getBalance(userId),
    db().select({
      _id: coinTransactions.id,
      type: coinTransactions.type,
      amount: coinTransactions.amount,
      description: coinTransactions.description,
      createdAt: coinTransactions.createdAt,
    }).from(coinTransactions).where(eq(coinTransactions.userId, userId))
      .orderBy(desc(coinTransactions.createdAt)).limit(LEDGER_LIMIT),
  ]);
  return { balance, transactions };
}

export async function getBalance(userId: string): Promise<number> {
  const rows = await db().select({ balance: userBalances.balance }).from(userBalances)
    .where(eq(userBalances.userId, userId));
  return rows[0]?.balance ?? 0;
}

export async function listBalances() {
  return db().select({ userId: userBalances.userId, balance: userBalances.balance }).from(userBalances);
}

/** Balance and ledger change in one transaction. */
export async function credit(userId: string, tx: CoinTransaction) {
  await db().transaction(async (t) => {
    await t.insert(userBalances).values({ userId, balance: tx.amount })
      .onConflictDoUpdate({ target: userBalances.userId, set: { balance: sql`${userBalances.balance} + ${tx.amount}` } });
    await t.insert(coinTransactions).values({ userId, ...tx });
  });
}

/**
 * Debit only if the balance covers it. The conditional update and the ledger
 * entry commit together, so two concurrent purchases cannot both spend the
 * same coins and a debit is never left without its ledger row.
 */
export async function debitIfAffordable(
  userId: string,
  cost: number,
  tx: Omit<CoinTransaction, "amount">,
): Promise<number | null> {
  return db().transaction(async (t) => {
    const rows = await t.update(userBalances)
      .set({ balance: sql`${userBalances.balance} - ${cost}` })
      .where(and(eq(userBalances.userId, userId), gte(userBalances.balance, cost)))
      .returning({ balance: userBalances.balance });
    if (!rows.length) return null;
    await t.insert(coinTransactions).values({ userId, ...tx, amount: -cost });
    return rows[0].balance;
  });
}
