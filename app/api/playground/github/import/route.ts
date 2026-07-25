import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { GitHubIntegration } from "@/models/GitHubIntegration";
import { getErrorMessage } from "@/lib/errors";

interface GitHubContentFile {
    type: string;
    content: string;
    sha: string;
}

interface GitHubRepository {
    default_branch?: string;
}

interface GitHubTreeItem {
    type: string;
    path?: string;
}

interface GitHubTree {
    tree?: GitHubTreeItem[];
}

/**
 * GET /api/playground/github/import?repo=owner/name&path=path/to/file
 *
 * Fetches a single file from the authenticated user's GitHub account.
 * Requires the user to have connected GitHub via /api/auth/github.
 */
export async function GET(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Sign in to import from GitHub." }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const repo = searchParams.get("repo");   // e.g. "octocat/my-repo"
        const path = searchParams.get("path");   // e.g. "src/payload.json"

        if (!repo || !path) {
            return NextResponse.json({ error: "Missing 'repo' or 'path' query param." }, { status: 400 });
        }

        await connectToDatabase();
        const integration = await GitHubIntegration.findOne({ userId });
        if (!integration) {
            return NextResponse.json({ error: "GitHub not connected. Connect via the playground toolbar." }, { status: 403 });
        }

        const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
        const ghRes = await fetch(apiUrl, {
            headers: {
                Authorization: `Bearer ${integration.accessToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });

        if (!ghRes.ok) {
            const detail = await ghRes.text();
            return NextResponse.json(
                { error: `GitHub returned ${ghRes.status}: ${detail}` },
                { status: ghRes.status }
            );
        }

        const data: GitHubContentFile = await ghRes.json();
        if (data.type !== "file") {
            return NextResponse.json({ error: "Path points to a directory, not a file." }, { status: 400 });
        }

        // Content is base64-encoded by GitHub
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        const fileName = path.split("/").pop() ?? "imported.json";

        return NextResponse.json({ fileName, content, sha: data.sha });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error, "Import failed.") }, { status: 500 });
    }
}

/**
 * GET /api/playground/github/import?repo=owner/name  (no path)
 *
 * Lists files in a GitHub repo tree (top 200 files) so the user can pick one.
 */
export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Sign in to browse GitHub." }, { status: 401 });
        }

        const { repo } = await req.json();
        if (!repo) {
            return NextResponse.json({ error: "Missing 'repo'." }, { status: 400 });
        }

        await connectToDatabase();
        const integration = await GitHubIntegration.findOne({ userId });
        if (!integration) {
            return NextResponse.json({ error: "GitHub not connected." }, { status: 403 });
        }

        // Get default branch
        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                Authorization: `Bearer ${integration.accessToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });

        if (!repoRes.ok) {
            return NextResponse.json({ error: `Repo not found or no access.` }, { status: 404 });
        }

        const repoData: GitHubRepository = await repoRes.json();
        const branch = repoData.default_branch ?? "main";

        // Get git tree recursively
        const treeRes = await fetch(
            `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
            {
                headers: {
                    Authorization: `Bearer ${integration.accessToken}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            }
        );

        if (!treeRes.ok) {
            return NextResponse.json({ error: "Could not fetch repository tree." }, { status: 502 });
        }

        const treeData: GitHubTree = await treeRes.json();
        const files: string[] = (treeData.tree ?? [])
            .filter((item): item is GitHubTreeItem & { path: string } =>
                item.type === "blob" && typeof item.path === "string"
            )
            .map((item) => item.path)
            .slice(0, 300);

        return NextResponse.json({ files, branch });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error, "Browse failed.") }, { status: 500 });
    }
}
