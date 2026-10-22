import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import * as blog from "@/lib/repositories/blog";
import { awardCoins } from "@/lib/coins";
import { getErrorMessage } from "@/lib/errors";

function makeSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET() {
    try {
        return NextResponse.json(await blog.listPublished());
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

        // Ensure unique slug
        const baseSlug = makeSlug(title);
        let slug = baseSlug;
        let suffix = 1;
        while (await blog.slugExists(slug)) {
            slug = `${baseSlug}-${suffix++}`;
        }

        const post = await blog.create({
            title: title.trim(),
            slug,
            content: content.trim(),
            authorId: userId,
            authorName: user?.fullName || user?.username || "Anonymous",
            authorImageUrl: user?.imageUrl || "",
            tags: Array.isArray(tags) ? tags : (tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
            published: true,
        });

        // Award 2 coins
        await awardCoins(userId, 2, "blog_post", `Published blog: ${title}`);

        return NextResponse.json({ success: true, post });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
