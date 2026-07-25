import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Blog } from "@/models/Blog";
import { isAdmin } from "@/lib/coins";
import { getErrorMessage } from "@/lib/errors";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        await connectToDatabase();
        const post = await Blog.findOne({ slug, published: true }).lean();
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
        await connectToDatabase();
        const post = await Blog.findOne({ slug });
        if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const admin = await isAdmin(userId);
        if (post.authorId !== userId && !admin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await Blog.deleteOne({ slug });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
