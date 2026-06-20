import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const difficulty = searchParams.get("difficulty");
    const category = searchParams.get("category");

    const query: any = {};
    if (difficulty) query.difficulty = difficulty;
    if (category) query.category = category;

    await connectToDatabase();
    const problems = await Problem.find(query).select("-testCases -hiddenTestCases -solution").sort({ createdAt: -1 });

    return NextResponse.json(problems);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Create a slug from the title
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    await connectToDatabase();

    const newProblem = new Problem({
      ...data,
      slug,
      createdByAI: false,
    });

    await newProblem.save();

    return NextResponse.json({ success: true, problem: newProblem });
  } catch (error: any) {
    console.error("Error adding problem manually:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
