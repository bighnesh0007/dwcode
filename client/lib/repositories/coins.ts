/**
 * Coin wallets and ledger — facade over mongo/coins.ts and pg/coins.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/coins";
import * as p from "./pg/coins";
import { pgImpl, read, write } from "./backend";

export type { CoinTransaction } from "./mongo/coins";
export const getWallet = read("coins.getWallet", m.getWallet, pgImpl<typeof m.getWallet>(p.getWallet));
export const getBalance = read("coins.getBalance", m.getBalance, p.getBalance);
export const listBalances = read("coins.listBalances", m.listBalances,
  pgImpl<typeof m.listBalances>(p.listBalances), { ignoreId: true });
export const credit = write("coins.credit", m.credit, p.credit);
/** Mirrored only when Mongo actually debited. */
export const debitIfAffordable = write("coins.debitIfAffordable", m.debitIfAffordable, p.debitIfAffordable,
  async (debited, userId, cost, tx) => { if (debited !== null) await p.debitIfAffordable(userId, cost, tx); });
