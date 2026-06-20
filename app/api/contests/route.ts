import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Contest } from "@/models/Contest";

function generateInviteCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function computeStatus(startTime: Date, endTime: Date) {
    const now = new Date();
    if (now < startTime) return "upcoming";
    if (now > endTime) return "ended";
    return "active";
}

// GET /api/contests  — list all contests
export async function GET() {
    try {
        await connectToDatabase();
        const contests = await Contest.find()
            .sort({ startTime: -1 })
            .populate("problems", "title slug difficulty")
            .lean();

        // Recompute status dynamically
        const enriched = contests.map((c: any) => ({
            ...c,
            status: computeStatus(new Date(c.startTime), new Date(c.endTime)),
            participantCount: c.participants?.length ?? 0,
        }));

        return NextResponse.json(enriched);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/contests  — create a contest
export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const user = await currentUser();
        const data = await req.json();
        const { title, description, problemIds, startTime, duration, isPublic, maxParticipants } = data;

        if (!title || !startTime || !duration || !problemIds?.length) {
            return NextResponse.json(
                { error: "title, startTime, duration, and at least one problem are required" },
                { status: 400 }
            );
        }

        const start = new Date(startTime);
        const end = new Date(start.getTime() + duration * 60 * 1000);

        await connectToDatabase();

        // Fetch problem slugs for quick lookup
        const { Problem } = await import("@/models/Problem");
        const problems = await Problem.find({ _id: { $in: problemIds } }).select("slug").lean();
        const problemSlugs = (problems as any[]).map((p) => p.slug);

        const contest = new Contest({
            title,
            description: description || "",
            createdBy: userId,
            createdByName: user?.fullName || user?.username || "Anonymous",
            problems: problemIds,
            problemSlugs,
            startTime: start,
            endTime: end,
            duration,
            status: computeStatus(start, end),
            isPublic: isPublic !== false,
            maxParticipants: maxParticipants || 100,
            inviteCode: generateInviteCode(),
            participants: [],
        });

        await contest.save();
        return NextResponse.json({ success: true, contest });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
