import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as profiles from "@/lib/repositories/profiles";
import { getErrorMessage } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { targetUsername } = body;

    if (!targetUsername) return NextResponse.json({ error: "Missing target username" }, { status: 400 });

    const targetUser = await profiles.findByUsername(targetUsername);
    if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (targetUser.userId === userId) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

    const currentUserProfile = await profiles.findByUserId(userId);
    if (!currentUserProfile) return NextResponse.json({ error: "Your profile not found" }, { status: 404 });

    const isFollowing = currentUserProfile.following.includes(targetUser.userId);

    if (isFollowing) {
      // Unfollow
      await profiles.unfollow(userId, targetUser.userId);
      return NextResponse.json({ message: "Unfollowed successfully", following: false });
    } else {
      // Follow
      await profiles.follow(userId, targetUser.userId);
      return NextResponse.json({ message: "Followed successfully", following: true });
    }
  } catch (error) {
    console.error("[profile/follow] ERROR:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
