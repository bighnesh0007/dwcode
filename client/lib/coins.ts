import { credit } from "@/lib/repositories/coins";
import { hasAdminRole } from "@/lib/repositories/roles";

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
        await credit(userId, { type, amount, description });
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
        return await hasAdminRole(userId);
    } catch {
        return false;
    }
}
