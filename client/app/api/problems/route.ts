import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as problems from "@/lib/repositories/problems";
import { pickWritableProblemFields, slugify } from "@/lib/problemFields";
import { awardCoins } from "@/lib/coins";
import { getErrorMessage } from "@/lib/errors";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const difficulty = searchParams.get("difficulty");
    const category = searchParams.get("category");

    const list = await problems.listPublic({
      ...(difficulty ? { difficulty } : {}),
      ...(category ? { category } : {}),
    });

    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/problems — signed-in users only.
 *
 * Authentication used to be best-effort — the `auth()` call sat in a try/catch
 * whose handler swallowed the failure and continued with `createdBy: ""`, so
 * anonymous callers could insert documents into the problem bank (finding M-1).
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const createdBy = userId;

    const data = await req.json();
    if (typeof data?.title !== "string" || !data.title.trim()) {
      return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });
    }
    const slug = slugify(data.title);

    // Only writable fields: the body never sets _id, createdAt or provenance.
    const newProblem = await problems.create({
      ...pickWritableProblemFields(data),
      slug,
      createdByAI: false,
      createdBy,
    });

    // Award 2 coins for creating a problem
    await awardCoins(createdBy, 2, "problem_created", `Created problem: ${data.title}`);

    return NextResponse.json({ success: true, problem: newProblem });
  } catch (error) {
    console.error("Error adding problem manually:", error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
