import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { UserRole } from "@/models/UserRole";

export async function requireAdmin(): Promise<{ userId: string; isSuperAdmin: boolean } | null> {
    try {
        const { userId } = await auth();
        if (!userId) return null;

        const isSuperAdmin = userId === process.env.SUPER_ADMIN_USER_ID;
        if (isSuperAdmin) return { userId, isSuperAdmin: true };

        await connectToDatabase();
        const role = await UserRole.findOne({ userId, role: "admin" }).lean();
        if (role) return { userId, isSuperAdmin: false };

        return null;
    } catch {
        return null;
    }
}
