import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Contest } from "@/models/Contest";
import { getErrorMessage } from "@/lib/errors";

// GET /api/contests/:id
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth();
        const { id } = await params;
        await connectToDatabase();
        const contest = await Contest.findById(id)
            .populate("problems", "title slug difficulty tags")
            .lean();
        if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const isCreator = contest.createdBy === userId;
        const isParticipant = Boolean(
            userId && contest.participants?.some((participant) => participant.userId === userId)
        );
        if (!contest.isPublic && !isCreator && !isParticipant) {
            return NextResponse.json({ error: "Invite required" }, { status: 403 });
        }
        return NextResponse.json({
            ...contest,
            status:
                new Date() < new Date(contest.startTime)
                    ? "upcoming"
                    : new Date() > new Date(contest.endTime)
                      ? "ended"
                      : "active",
            inviteCode: isCreator ? contest.inviteCode : undefined,
            isCreator,
            isParticipant,
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

// POST /api/contests/:id/join  — handled via action query param
// POST /api/contests/:id  ?action=join | leave
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action");

        await connectToDatabase();
        const contest = await Contest.findById(id);
        if (!contest) return NextResponse.json({ error: "Contest not found" }, { status: 404 });

        const now = new Date();
        if (action === "join") {
            if (!contest.isPublic) {
                return NextResponse.json(
                    { error: "Join this private contest with its invite key." },
                    { status: 403 }
                );
            }
            if (now > contest.endTime) {
                return NextResponse.json({ error: "Contest has ended" }, { status: 400 });
            }
            const alreadyIn = contest.participants.some((participant) => participant.userId === userId);
            if (alreadyIn) {
                return NextResponse.json({ success: true, message: "Already joined" });
            }
            if (contest.participants.length >= contest.maxParticipants) {
                return NextResponse.json({ error: "Contest is full" }, { status: 400 });
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
            return NextResponse.json({ success: true });
        }

        if (action === "leave") {
            const participantIndex = contest.participants.findIndex(
                (participant) => participant.userId === userId
            );
            if (participantIndex !== -1) {
                contest.participants.splice(participantIndex, 1);
            }
            await contest.save();
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}

// DELETE /api/contests/:id  — only creator can delete
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        await connectToDatabase();
        const contest = await Contest.findById(id);
        if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (contest.createdBy !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        await Contest.findByIdAndDelete(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
