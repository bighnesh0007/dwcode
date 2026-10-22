import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as githubIntegrations from "@/lib/repositories/githubIntegrations";
import { getErrorMessage } from "@/lib/errors";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await githubIntegrations.deleteByUserId(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
