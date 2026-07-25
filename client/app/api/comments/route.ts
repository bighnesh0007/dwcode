import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Comment } from "@/models/Comment";
import { getErrorMessage } from "@/lib/errors";

// GET /api/comments?problemSlug=xxx
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const problemSlug = searchParams.get("problemSlug");
        if (!problemSlug) {
            return NextResponse.json({ error: "problemSlug required" }, { status: 400 });
        }
        await connectToDatabase();
        const comments = await Comment.find({ problemSlug })
            .sort({ createdAt: -1 })
            .lean();
        return NextResponse.json(comments);
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

// POST /api/comments  { problemSlug, content }
export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const user = await currentUser();
        const { problemSlug, content } = await req.json();
        if (!problemSlug || !content?.trim()) {
            return NextResponse.json({ error: "problemSlug and content required" }, { status: 400 });
        }
        await connectToDatabase();
        const comment = new Comment({
            problemSlug,
            userId,
            userName: user?.fullName || user?.username || "Anonymous",
            userImageUrl: user?.imageUrl || "",
            content: content.trim(),
        });
        await comment.save();

        // Award 1 coin for commenting
        try {
            const { awardCoins } = await import("@/lib/coins");
            await awardCoins(userId, 1, "comment", "Posted a comment");
        } catch { /* ignore */ }

        return NextResponse.json({ success: true, comment });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}

// DELETE /api/comments?id=xxx
export async function DELETE(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

        await connectToDatabase();
        const comment = await Comment.findById(id);
        if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (comment.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        await Comment.findByIdAndDelete(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
