import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Contest } from "@/models/Contest";
import type { ProblemSchema } from "@/models/Problem";
import type { InferSchemaType } from "mongoose";
import { randomBytes } from "node:crypto";
import { getErrorMessage } from "@/lib/errors";

function generateInviteCode() {
    return randomBytes(5).toString("base64url").slice(0, 8).toUpperCase();
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
        const { userId } = await auth();
        await connectToDatabase();
        const visibility = userId
            ? {
                $or: [
                    { isPublic: true },
                    { createdBy: userId },
                    { "participants.userId": userId },
                ],
            }
            : { isPublic: true };
        const contests = await Contest.find(visibility)
            .sort({ startTime: -1 })
            .populate<{ problems: InferSchemaType<typeof ProblemSchema>[] }>("problems", "title slug difficulty")
            .lean();

        const enriched = contests.map((contest) => ({
            ...contest,
            status: computeStatus(new Date(contest.startTime), new Date(contest.endTime)),
            participantCount: contest.participants?.length ?? 0,
            isParticipant: Boolean(
                userId && contest.participants?.some((participant) => participant.userId === userId)
            ),
            inviteCode: contest.createdBy === userId ? contest.inviteCode : undefined,
            participants: undefined,
        }));

        return NextResponse.json(enriched);
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

// POST /api/contests  — create a contest
export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const data = await req.json();
        if (data.action === "joinByCode") {
            const inviteCode =
                typeof data.inviteCode === "string"
                    ? data.inviteCode.trim().toUpperCase()
                    : "";

            if (!inviteCode) {
                return NextResponse.json({ error: "Enter an invite key." }, { status: 400 });
            }

            await connectToDatabase();
            const contest = await Contest.findOne({ inviteCode });
            if (!contest || contest.isPublic) {
                return NextResponse.json({ error: "Invalid invite key." }, { status: 404 });
            }
            if (new Date() > contest.endTime) {
                return NextResponse.json({ error: "This contest has ended." }, { status: 400 });
            }
            if (contest.participants.some((participant) => participant.userId === userId)) {
                return NextResponse.json({ success: true, contestId: contest.id });
            }
            if (contest.participants.length >= contest.maxParticipants) {
                return NextResponse.json({ error: "This contest is full." }, { status: 409 });
            }

            const user = await currentUser();
            contest.participants.push({
                userId,
                userName: user?.fullName || user?.username || "Anonymous",
                userImageUrl: user?.imageUrl || "",
                score: 0,
                solvedProblems: [],
                joinedAt: new Date(),
            });
            await contest.save();

            return NextResponse.json({ success: true, contestId: contest.id });
        }

        const user = await currentUser();
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
        const problemSlugs = problems.map((problem) => problem.slug);

        const isPrivate = isPublic === false;
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
            isPublic: !isPrivate,
            maxParticipants: maxParticipants || 100,
            inviteCode: isPrivate ? generateInviteCode() : undefined,
            participants: [],
        });

        await contest.save();
        return NextResponse.json({ success: true, contest });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
