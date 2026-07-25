import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { Note } from "@/models/Note";
import { getErrorMessage } from "@/lib/errors";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const problemId = searchParams.get("problemId");
    if (!problemId) {
      return NextResponse.json({ error: "problemId required" }, { status: 400 });
    }
    await connectToDatabase();
    const note = await Note.findOne({ problemId }).lean();
    return NextResponse.json(note || { content: "" });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { problemId, problemSlug, content } = await req.json();
    await connectToDatabase();

    const note = await Note.findOneAndUpdate(
      { problemId },
      { problemId, problemSlug, content, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    return NextResponse.json({ success: true, note });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
