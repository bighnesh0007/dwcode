import connectToDatabase from "@/lib/db";
import { UserCoins } from "@/models/UserCoins";

/**
 * Award coins to a user. Silently logs errors — never throws.
 */
export async function awardCoins(
    userId: string,
    amount: number,
    type: string,
    description: string
) {
    if (!userId || amount === 0) return;
    try {
        await connectToDatabase();
        await UserCoins.findOneAndUpdate(
            { userId },
            {
                $inc: { balance: amount },
                $push: {
                    transactions: {
                        $each: [{ type, amount, description, createdAt: new Date() }],
                        $position: 0,   // prepend so newest is first
                        $slice: 200,    // keep last 200 transactions
                    },
                },
            },
            { upsert: true }
        );
    } catch (err) {
        console.error("[awardCoins] failed:", err);
    }
}

/**
 * Check if a user is the super-admin or has admin role in DB.
 */
export async function isAdmin(userId: string): Promise<boolean> {
    if (!userId) return false;
    if (userId === process.env.SUPER_ADMIN_USER_ID) return true;
    try {
        await connectToDatabase();
        const { UserRole } = await import("@/models/UserRole");
        const role = await UserRole.findOne({ userId, role: "admin" }).lean();
        return Boolean(role);
    } catch {
        return false;
    }
}
