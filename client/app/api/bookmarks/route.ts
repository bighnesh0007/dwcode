import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as bookmarks from "@/lib/repositories/bookmarks";
import { getErrorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json([]);
    }
    return NextResponse.json(await bookmarks.listByUser(userId));
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { problemId, problemSlug } = await req.json();
    const bookmarked = await bookmarks.toggle(userId, problemId, problemSlug);
    return NextResponse.json({ success: true, bookmarked });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
