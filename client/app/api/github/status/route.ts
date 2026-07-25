import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { GitHubIntegration } from "@/models/GitHubIntegration";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  await connectToDatabase();
  const integration = await GitHubIntegration.findOne({ userId })
    .select("githubUsername repoName repoPrivate defaultBranch")
    .lean();

  return NextResponse.json({
    connected: Boolean(integration),
    username: integration?.githubUsername,
    repoName: integration?.repoName || "dwcode-workspace",
    repoPrivate: integration?.repoPrivate || false,
    defaultBranch: integration?.defaultBranch || "main",
  });
}
