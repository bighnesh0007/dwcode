import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as blog from "@/lib/repositories/blog";
import { getErrorMessage } from "@/lib/errors";

type VoteValue = 1 | -1 | 0;

function isVoteValue(value: unknown): value is VoteValue {
    return value === 1 || value === -1 || value === 0;
}

function voteCounts(blog: { upvotes?: number | null; downvotes?: number | null } | null) {
    // Blog documents created before the counter fields existed lack them.
    const upvotes = blog?.upvotes ?? 0;
    const downvotes = blog?.downvotes ?? 0;
    return { upvotes, downvotes, score: upvotes - downvotes };
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const post = await blog.findPublished(slug);
        if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

        let myVote: VoteValue = 0;
        const { userId } = await auth();
        if (userId) {
            const value = await blog.findVoteValue(slug, userId);
            if (isVoteValue(value)) myVote = value;
        }

        return NextResponse.json({ ...voteCounts(post), myVote });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { slug } = await params;

        const body: unknown = await req.json().catch(() => null);
        const rawValue =
            typeof body === "object" && body !== null && "value" in body
                ? body.value
                : undefined;
        if (!isVoteValue(rawValue)) {
            return NextResponse.json(
                { error: "value must be 1, -1 or 0" },
                { status: 400 }
            );
        }
        const value = rawValue;

        const post = await blog.findPublished(slug);
        if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

        // Never trust counts from the client — derive counter deltas purely from
        // the previous vote document (single writer per user enforced by the
        // unique { blogSlug, userId } index).
        // Retracting (0) removes the vote; otherwise it is upserted, with the
        // concurrent-retract race handled inside castVote.
        const prevValue =
            value === 0 ? await blog.retractVote(slug, userId) : await blog.castVote(slug, userId, value);

        if (prevValue !== value) {
            const incUp = (value === 1 ? 1 : 0) - (prevValue === 1 ? 1 : 0);
            const incDown = (value === -1 ? 1 : 0) - (prevValue === -1 ? 1 : 0);
            if (incUp !== 0 || incDown !== 0) {
                await blog.adjustVoteCounts(slug, incUp, incDown);
            }
        }

        // Re-read so the response reflects concurrent votes as well as ours.
        const updated = await blog.findPublished(slug);
        return NextResponse.json({ ...voteCounts(updated), myVote: value });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
