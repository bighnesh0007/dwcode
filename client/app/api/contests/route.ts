import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import * as contests from "@/lib/repositories/contests";
import * as problems from "@/lib/repositories/problems";
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
        const visible = await contests.listVisible(userId);

        const enriched = visible.map((contest) => ({
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

            const contest = await contests.findByInviteCode(inviteCode);
            if (!contest || contest.isPublic) {
                return NextResponse.json({ error: "Invalid invite key." }, { status: 404 });
            }
            if (new Date() > contest.endTime) {
                return NextResponse.json({ error: "This contest has ended." }, { status: 400 });
            }
            const contestId = String(contest._id);
            if (contest.participants.some((participant) => participant.userId === userId)) {
                return NextResponse.json({ success: true, contestId });
            }
            if (contest.participants.length >= contest.maxParticipants) {
                return NextResponse.json({ error: "This contest is full." }, { status: 409 });
            }

            const user = await currentUser();
            await contests.addParticipant(contest._id, {
                userId,
                userName: user?.fullName || user?.username || "Anonymous",
                userImageUrl: user?.imageUrl || "",
            });

            return NextResponse.json({ success: true, contestId });
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

        // Fetch problem slugs for quick lookup
        const problemSlugs = await problems.slugsForIds(problemIds);

        const isPrivate = isPublic === false;
        const contest = await contests.create({
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
        });

        return NextResponse.json({ success: true, contest });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
