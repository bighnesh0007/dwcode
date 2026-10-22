import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import * as githubIntegrations from "@/lib/repositories/githubIntegrations";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  const integration = await githubIntegrations.findSettings(userId);

  return NextResponse.json({
    connected: Boolean(integration),
    username: integration?.githubUsername,
    repoName: integration?.repoName || "dwcode-workspace",
    repoPrivate: integration?.repoPrivate || false,
    defaultBranch: integration?.defaultBranch || "main",
  });
}
