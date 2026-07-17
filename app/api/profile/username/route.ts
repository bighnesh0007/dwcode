import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { UserProfile } from "@/models/UserProfile";

export async function PUT(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { username, bio } = body;

    if (!username || username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: "Invalid username. Must be 3-20 characters, alphanumeric and underscores only." }, { status: 400 });
    }

    await connectToDatabase();

    // Check if another user has this username
    const existing = await UserProfile.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } });
    if (existing && existing.userId !== userId) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
    }

    const updated = await UserProfile.findOneAndUpdate(
      { userId },
      { username, bio },
      { new: true, upsert: true }
    );

    return NextResponse.json({ message: "Profile updated", profile: updated });
  } catch (error: any) {
    console.error("[profile/username] ERROR:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
