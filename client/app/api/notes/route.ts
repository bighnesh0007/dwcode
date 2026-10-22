import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as notes from "@/lib/repositories/notes";
import { isValidId } from "@/lib/repositories/shared";
import { getErrorMessage } from "@/lib/errors";

/**
 * Private per-user study notes.
 *
 * SECURITY HISTORY (audit finding C-3). Neither handler called `auth()`, and
 * notes were keyed on `problemId` alone — one global note per problem shared by
 * everyone. Any anonymous visitor could enumerate /api/problems and then read or
 * overwrite every user's notes, while the UI presented them as personal.
 *
 * Both handlers now require a session and scope every query by the userId taken
 * from that session. The id is never read from the request.
 */

const MAX_CONTENT_LENGTH = 20_000;

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const problemId = searchParams.get("problemId");
    if (!problemId) {
      return NextResponse.json({ error: "problemId required" }, { status: 400 });
    }
    if (!isValidId(problemId)) {
      return NextResponse.json({ error: "invalid problemId" }, { status: 400 });
    }

    const note = await notes.findOwn(userId, problemId);
    return NextResponse.json(note ?? { content: "" });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { problemId, problemSlug, content } = await req.json();

    if (!isValidId(problemId)) {
      return NextResponse.json({ success: false, error: "invalid problemId" }, { status: 400 });
    }
    if (typeof problemSlug !== "string" || !problemSlug.trim()) {
      return NextResponse.json({ success: false, error: "problemSlug required" }, { status: 400 });
    }
    if (typeof content !== "string") {
      return NextResponse.json(
        { success: false, error: "content must be a string" },
        { status: 400 },
      );
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ success: false, error: "Note is too large." }, { status: 413 });
    }

    // Scoped by userId inside the repository, so an upsert can never create or
    // claim a row belonging to someone else.
    const note = await notes.saveOwn(userId, problemId, problemSlug, content);
    return NextResponse.json({ success: true, note });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
