import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as blog from "@/lib/repositories/blog";
import { isAdmin } from "@/lib/coins";
import { getErrorMessage } from "@/lib/errors";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const post = await blog.findPublished(slug);
        if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(post);
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { slug } = await params;
        const post = await blog.findBySlug(slug);
        if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const admin = await isAdmin(userId);
        if (post.authorId !== userId && !admin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Votes go too: slugs are reusable, and stale votes would seed a recycled
        // slug with counts its new author never earned.
        await blog.deleteWithVotes(slug);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
