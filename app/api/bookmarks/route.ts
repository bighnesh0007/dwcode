import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Bookmark } from "@/models/Bookmark";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json([]);
    }
    await connectToDatabase();
    const bookmarks = await Bookmark.find({ userId }).lean();
    return NextResponse.json(bookmarks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { problemId, problemSlug } = await req.json();
    await connectToDatabase();

    const existing = await Bookmark.findOne({ problemId, userId });
    if (existing) {
      await Bookmark.deleteOne({ problemId, userId });
      return NextResponse.json({ success: true, bookmarked: false });
    } else {
      const bookmark = new Bookmark({ problemId, problemSlug, userId });
      await bookmark.save();
      return NextResponse.json({ success: true, bookmarked: true });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
