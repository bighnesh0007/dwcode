import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { GitHubIntegration } from "@/models/GitHubIntegration";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, decodeURIComponent(value.join("="))];
    })
  );
  const expectedState = cookies.github_oauth_state;
  const returnTo =
    cookies.github_oauth_return_to?.startsWith("/") &&
    !cookies.github_oauth_return_to.startsWith("//")
      ? cookies.github_oauth_return_to
      : "/profile";
  
  if (!code) {
    return NextResponse.redirect(new URL("/profile?error=missing_code", req.url));
  }
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/profile?error=invalid_oauth_state", req.url));
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/profile?error=missing_github_credentials", req.url));
  }

  try {
    // 1. Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error("GitHub OAuth Error:", tokenData);
      return NextResponse.redirect(new URL(`/profile?error=${tokenData.error}`, req.url));
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch GitHub user info
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const userData = await userResponse.json();

    if (!userData.login) {
      return NextResponse.redirect(new URL("/profile?error=github_user_fetch_failed", req.url));
    }

    // 3. Save to database
    await connectToDatabase();
    await GitHubIntegration.findOneAndUpdate(
      { userId },
      {
        userId,
        githubId: userData.id.toString(),
        githubUsername: userData.login,
        accessToken,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    const destination = new URL(returnTo, req.url);
    destination.searchParams.set("github", "connected");
    const response = NextResponse.redirect(destination);
    response.cookies.delete("github_oauth_state");
    response.cookies.delete("github_oauth_return_to");
    return response;
  } catch (error) {
    console.error("Error connecting GitHub:", error);
    return NextResponse.redirect(new URL("/profile?error=internal_error", req.url));
  }
}
