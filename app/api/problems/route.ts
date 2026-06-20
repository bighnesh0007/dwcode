import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";
import { awardCoins } from "@/lib/coins";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const difficulty = searchParams.get("difficulty");
    const category = searchParams.get("category");

    const query: any = {};
    if (difficulty) query.difficulty = difficulty;
    if (category) query.category = category;

    await connectToDatabase();
    const problems = await Problem.find(query)
      .select("-testCases -hiddenTestCases -solution")
      .sort({ createdAt: -1 });

    return NextResponse.json(problems);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

    await connectToDatabase();

    // Attach creator if signed in
    let createdBy = "";
    try {
      const { userId } = await auth();
      if (userId) createdBy = userId;
    } catch { /* ignore */ }

    const newProblem = new Problem({ ...data, slug, createdByAI: false, createdBy });
    await newProblem.save();

    // Award 2 coins for creating a problem
    if (createdBy) {
      await awardCoins(createdBy, 2, "problem_created", `Created problem: ${data.title}`);
    }

    return NextResponse.json({ success: true, problem: newProblem });
  } catch (error: any) {
    console.error("Error adding problem manually:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
