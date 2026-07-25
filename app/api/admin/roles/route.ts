import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { UserRole } from "@/models/UserRole";
import { getErrorMessage } from "@/lib/errors";

function isSuperAdmin(userId: string) {
    return userId === process.env.SUPER_ADMIN_USER_ID;
}

// GET — list all admins
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId || !isSuperAdmin(userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        await connectToDatabase();
        const roles = await UserRole.find({ role: "admin" }).lean();
        return NextResponse.json(roles);
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

// POST — grant admin { targetUserId, targetUserName }
export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId || !isSuperAdmin(userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { targetUserId, targetUserName } = await req.json();
        if (!targetUserId) {
            return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
        }
        await connectToDatabase();
        await UserRole.findOneAndUpdate(
            { userId: targetUserId },
            { userId: targetUserId, userName: targetUserName || "", role: "admin", grantedBy: userId, createdAt: new Date() },
            { upsert: true }
        );
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}

// DELETE — revoke admin ?userId=xxx
export async function DELETE(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId || !isSuperAdmin(userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { searchParams } = new URL(req.url);
        const targetUserId = searchParams.get("userId");
        if (!targetUserId) {
            return NextResponse.json({ error: "userId required" }, { status: 400 });
        }
        await connectToDatabase();
        await UserRole.deleteOne({ userId: targetUserId });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
