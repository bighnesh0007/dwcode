import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as profiles from "@/lib/repositories/profiles";
import { getErrorMessage } from "@/lib/errors";

export async function PUT(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { username, bio } = body;

    if (!username || username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: "Invalid username. Must be 3-20 characters, alphanumeric and underscores only." }, { status: 400 });
    }

    // Check if another user has this username
    const existing = await profiles.findByUsernameIgnoreCase(username);
    if (existing && existing.userId !== userId) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
    }

    const updated = await profiles.upsertUsernameAndBio(userId, username, bio);

    return NextResponse.json({ message: "Profile updated", profile: updated });
  } catch (error) {
    console.error("[profile/username] ERROR:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
