import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Blog } from "@/models/Blog";
import { awardCoins } from "@/lib/coins";
import { getErrorMessage } from "@/lib/errors";

function makeSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET() {
    try {
        await connectToDatabase();
        const posts = await Blog.find({ published: true }).sort({ createdAt: -1 }).lean();
        return NextResponse.json(posts);
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await currentUser();
        const { title, content, tags } = await req.json();

        if (!title?.trim() || !content?.trim()) {
            return NextResponse.json({ error: "title and content required" }, { status: 400 });
        }

        await connectToDatabase();

        // Ensure unique slug
        const baseSlug = makeSlug(title);
        let slug = baseSlug;
        let suffix = 1;
        while (await Blog.findOne({ slug })) {
            slug = `${baseSlug}-${suffix++}`;
        }

        const post = new Blog({
            title: title.trim(),
            slug,
            content: content.trim(),
            authorId: userId,
            authorName: user?.fullName || user?.username || "Anonymous",
            authorImageUrl: user?.imageUrl || "",
            tags: Array.isArray(tags) ? tags : (tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
            published: true,
        });
        await post.save();

        // Award 2 coins
        await awardCoins(userId, 2, "blog_post", `Published blog: ${title}`);

        return NextResponse.json({ success: true, post });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
