import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";

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

    // Attach Clerk user info if signed in
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
    } catch {
      // auth() throws outside of middleware context in some edge cases — ignore
    }

    const submission = new Submission({ ...data, userId, userName, userImageUrl });
    await submission.save();
    return NextResponse.json({ success: true, submission });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
