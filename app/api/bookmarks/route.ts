import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { Bookmark } from "@/models/Bookmark";

export async function GET() {
  try {
    await connectToDatabase();
    const bookmarks = await Bookmark.find().lean();
    return NextResponse.json(bookmarks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { problemId, problemSlug } = await req.json();
    await connectToDatabase();

    // Toggle bookmark
    const existing = await Bookmark.findOne({ problemId });
    if (existing) {
      await Bookmark.deleteOne({ problemId });
      return NextResponse.json({ success: true, bookmarked: false });
    } else {
      const bookmark = new Bookmark({ problemId, problemSlug });
      await bookmark.save();
      return NextResponse.json({ success: true, bookmarked: true });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
