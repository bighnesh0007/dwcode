import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Problem } from "@/models/Problem";
import { awardCoins } from "@/lib/coins";

export async function GET() {
  try {
    await connectToDatabase();
    const submissions = await Submission.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(submissions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    await connectToDatabase();

    // Attach Clerk user info
    let userId = "";
    let userName = "Anonymous";
    let userImageUrl = "";

    try {
      const { userId: uid } = await auth();
      if (uid) {
        const user = await currentUser();
        userId = uid;
        userName = user?.fullName || user?.username || "Anonymous";
        userImageUrl = user?.imageUrl || "";
      }
    } catch { /* ignore */ }

    const submission = new Submission({ ...data, userId, userName, userImageUrl });
    await submission.save();

    // Award coins for accepted submissions
    if (userId && data.status === "Accepted") {
      try {
        const problem = await Problem.findById(data.problemId).select("difficulty slug").lean() as any;
        if (problem) {
          // Check if this is the first solve
          const prevAccepted = await Submission.countDocuments({
            userId,
            problemId: data.problemId,
            status: "Accepted",
            _id: { $ne: submission._id },
          });

          if (prevAccepted === 0) {
            await awardCoins(userId, 10, "first_solve", `First solve: ${problem.slug}`);
          }

          // Difficulty bonus (always on accepted)
          const diffCoins: Record<string, number> = { Easy: 5, Medium: 10, Hard: 20 };
          const bonus = diffCoins[problem.difficulty] ?? 5;
          await awardCoins(userId, bonus, "difficulty_bonus", `${problem.difficulty} problem solved`);
        }
      } catch (coinErr) {
        console.error("[coins] award failed:", coinErr);
      }
    }

    return NextResponse.json({ success: true, submission });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
