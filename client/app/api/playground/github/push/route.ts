import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { publishPlaygroundToGitHub } from "@/lib/github";

const MAX_SCRIPT_LENGTH = 50_000;
const MAX_FILES = 12;
const MAX_FILE_LENGTH = 100_000;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Sign in to publish to GitHub." }, { status: 401 });
    }

    const body = await request.json();
    const script = typeof body.script === "string" ? body.script : "";
    if (!script.trim() || script.length > MAX_SCRIPT_LENGTH) {
      return NextResponse.json({ error: "Invalid DataWeave script." }, { status: 400 });
    }

    const files = (Array.isArray(body.files) ? body.files : [])
      .slice(0, MAX_FILES)
      .map((file: { name?: unknown; content?: unknown }, index: number) => ({
        name:
          typeof file.name === "string" && file.name.trim()
            ? file.name.trim().slice(0, 80)
            : `input-${index + 1}.json`,
        content: typeof file.content === "string" ? file.content : "",
      }));

    if (files.some((file: { content: string }) => file.content.length > MAX_FILE_LENGTH)) {
      return NextResponse.json({ error: "An input file is too large." }, { status: 413 });
    }

    const result = await publishPlaygroundToGitHub(userId, {
      script,
      files,
      testCases: Array.isArray(body.testCases) ? body.testCases.slice(0, 20) : [],
      output: typeof body.output === "string" ? body.output.slice(0, MAX_FILE_LENGTH) : "",
      message:
        typeof body.message === "string"
          ? body.message.trim().slice(0, 100)
          : "DataWeave playground run",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GitHub publish failed." },
      { status: 500 }
    );
  }
}
