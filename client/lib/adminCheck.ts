import { auth } from "@clerk/nextjs/server";
import { hasAdminRole } from "@/lib/repositories/roles";

export async function requireAdmin(): Promise<{ userId: string; isSuperAdmin: boolean } | null> {
    try {
        const { userId } = await auth();
        if (!userId) return null;

        const isSuperAdmin = userId === process.env.SUPER_ADMIN_USER_ID;
        if (isSuperAdmin) return { userId, isSuperAdmin: true };

        if (await hasAdminRole(userId)) return { userId, isSuperAdmin: false };

        return null;
    } catch {
        return null;
    }
}
