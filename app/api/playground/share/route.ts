import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { PlaygroundSnippet } from "@/models/PlaygroundSnippet";

const MAX_SCRIPT_LENGTH = 50_000;
const MAX_FILE_COUNT = 12;
const MAX_FILE_LENGTH = 100_000;
const MAX_TEST_COUNT = 20;

type IncomingFile = {
  name?: unknown;
  kind?: unknown;
  language?: unknown;
  content?: unknown;
};

type IncomingTestCase = {
  name?: unknown;
  files?: unknown;
  expectedOutput?: unknown;
};

type MongoDuplicateKeyError = Error & {
  code?: number;
};

function makeSlug() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeFile(file: IncomingFile, fallbackName: string) {
  const name =
    typeof file.name === "string" && file.name.trim()
      ? file.name.trim().slice(0, 80)
      : fallbackName;
  const content = typeof file.content === "string" ? file.content : "";

  if (content.length > MAX_FILE_LENGTH) {
    throw new Error(`Input file "${name}" is too large.`);
  }

  const language = ["json", "xml", "csv", "yaml", "text", "java", "ndjson", "multipart"].includes(String(file.language))
    ? file.language
    : "json";
  const kind = ["payload", "vars", "attributes", "custom"].includes(String(file.kind))
    ? file.kind
    : "custom";

  return {
    name,
    kind,
    language,
    content,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const script = typeof body.script === "string" ? body.script : "";

    if (!script.trim()) {
      return NextResponse.json(
        { error: "Missing script." },
        { status: 400 }
      );
    }

    if (script.length > MAX_SCRIPT_LENGTH) {
      return NextResponse.json(
        { error: "Script is too large." },
        { status: 413 }
      );
    }

    const incomingFiles = Array.isArray(body.files) ? body.files : [];
    const files = incomingFiles
      .slice(0, MAX_FILE_COUNT)
      .map((file: IncomingFile, index: number) =>
        normalizeFile(file, `input-${index + 1}.json`)
      );

    const incomingTests = Array.isArray(body.testCases) ? body.testCases : [];
    const testCases = incomingTests
      .slice(0, MAX_TEST_COUNT)
      .map((testCase: IncomingTestCase, index: number) => ({
        name:
          typeof testCase.name === "string" && testCase.name.trim()
            ? testCase.name.trim().slice(0, 80)
            : `Test ${index + 1}`,
        files: (Array.isArray(testCase.files) ? testCase.files : files)
          .slice(0, MAX_FILE_COUNT)
          .map((file: IncomingFile, fileIndex: number) =>
            normalizeFile(file, `input-${fileIndex + 1}.json`)
          ),
        expectedOutput:
          typeof testCase.expectedOutput === "string"
            ? testCase.expectedOutput.slice(0, MAX_FILE_LENGTH)
            : "",
      }));

    await connectToDatabase();

    let snippet = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        snippet = await PlaygroundSnippet.create({
          slug: makeSlug(),
          script,
          files,
          testCases,
        });
        break;
      } catch (error: unknown) {
        if ((error as MongoDuplicateKeyError).code !== 11000) throw error;
      }
    }

    if (!snippet) {
      return NextResponse.json(
        { error: "Could not create share link." },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: snippet.slug });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Could not save snippet.") },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing snippet id." },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const snippet = await PlaygroundSnippet.findOne({ slug: id }).lean();

    if (!snippet) {
      return NextResponse.json(
        { error: "Snippet not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: snippet.slug,
      script: snippet.script,
      files: snippet.files,
      testCases: snippet.testCases,
      createdAt: snippet.createdAt,
      updatedAt: snippet.updatedAt,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Could not load snippet.") },
      { status: 500 }
    );
  }
}
