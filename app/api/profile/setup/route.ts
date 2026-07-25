import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { UserProfile } from "@/models/UserProfile";
import { getErrorMessage } from "@/lib/errors";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await connectToDatabase();

    const existingProfile = await UserProfile.findOne({ userId });
    if (existingProfile) {
      return NextResponse.json({ message: "Profile already exists", profile: existingProfile });
    }

    // Generate default username from email
    const email = user.emailAddresses[0]?.emailAddress || "";
    const baseUsername = email.split("@")[0] || `dw_${userId.slice(-6)}`;
    
    // Ensure uniqueness
    let username = baseUsername;
    let counter = 1;
    while (await UserProfile.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const newProfile = await UserProfile.create({
      userId,
      username,
      bio: "",
    });

    return NextResponse.json({ message: "Profile created", profile: newProfile });
  } catch (error) {
    console.error("[profile/setup] ERROR:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
