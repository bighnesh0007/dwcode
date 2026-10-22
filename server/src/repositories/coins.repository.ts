/** Coin ledger. Same update the Next.js `awardCoins` performed. */
import { UserCoins } from "../models/UserCoins.ts";

export class CoinsRepository {
  async award(userId: string, amount: number, type: string, description: string): Promise<void> {
    if (!userId || amount === 0) return;
    await UserCoins.findOneAndUpdate(
      { userId },
      {
        $inc: { balance: amount },
        $push: {
          transactions: {
            $each: [{ type, amount, description, createdAt: new Date() }],
            $position: 0, // newest first
            $slice: 200, // keep the last 200
          },
        },
      },
      { upsert: true },
    );
  }
}
