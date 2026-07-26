import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Blog } from "@/models/Blog";
import { BlogVote } from "@/models/BlogVote";
import { getErrorMessage } from "@/lib/errors";

type VoteValue = 1 | -1 | 0;

function isVoteValue(value: unknown): value is VoteValue {
    return value === 1 || value === -1 || value === 0;
}

/** MongoDB duplicate-key error (unique index violation). */
function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
    );
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
        await connectToDatabase();

        const blog = await Blog.findOne({ slug, published: true }).lean();
        if (!blog) return NextResponse.json({ error: "Not found" }, { status: 404 });

        let myVote: VoteValue = 0;
        const { userId } = await auth();
        if (userId) {
            const vote = await BlogVote.findOne({ blogSlug: slug, userId }).lean();
            const value = vote?.value ?? 0;
            if (isVoteValue(value)) myVote = value;
        }

        return NextResponse.json({ ...voteCounts(blog), myVote });
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

        await connectToDatabase();

        const blog = await Blog.findOne({ slug, published: true }).lean();
        if (!blog) return NextResponse.json({ error: "Not found" }, { status: 404 });

        // Never trust counts from the client — derive counter deltas purely from
        // the previous vote document (single writer per user enforced by the
        // unique { blogSlug, userId } index).
        let prevValue = 0;
        if (value === 0) {
            // Retract: remove the vote (if any) and undo its effect.
            const prev = await BlogVote.findOneAndDelete({ blogSlug: slug, userId }).lean();
            prevValue = prev?.value ?? 0;
        } else {
            // The retry MUST keep upsert: true (review finding). A retry without
            // upsert can race a concurrent retract from the same user: the retract
            // deletes the just-inserted doc, the upsert-less retry matches nothing
            // and persists NO vote, yet prev=null would read as "first vote" and
            // $inc a counter with no vote document backing it — permanent drift.
            // With upsert kept, prev=null genuinely means this request inserted
            // the vote, so the increment is always backed by a real document.
            let prev = null;
            const MAX_ATTEMPTS = 3;
            for (let attempt = 1; ; attempt++) {
                try {
                    prev = await BlogVote.findOneAndUpdate(
                        { blogSlug: slug, userId },
                        { $set: { value } },
                        { upsert: true, new: false } // prev = OLD doc, null on insert
                    ).lean();
                    break;
                } catch (error) {
                    // E11000 = a concurrent insert from the same user won this
                    // exact moment; retrying (still with upsert) converges.
                    if (!isDuplicateKeyError(error) || attempt >= MAX_ATTEMPTS) throw error;
                }
            }
            prevValue = prev?.value ?? 0;
        }

        if (prevValue !== value) {
            const incUp = (value === 1 ? 1 : 0) - (prevValue === 1 ? 1 : 0);
            const incDown = (value === -1 ? 1 : 0) - (prevValue === -1 ? 1 : 0);
            if (incUp !== 0 || incDown !== 0) {
                await Blog.updateOne(
                    { slug },
                    { $inc: { upvotes: incUp, downvotes: incDown } }
                );
            }
        }

        // Re-read so the response reflects concurrent votes as well as ours.
        const updated = await Blog.findOne({ slug, published: true }).lean();
        return NextResponse.json({ ...voteCounts(updated), myVote: value });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
