import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Problem } from "@/models/Problem";
import { getErrorMessage } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slugs } = await req.json();
    if (!Array.isArray(slugs) || slugs.length === 0) {
      return NextResponse.json({ migrated: 0 });
    }

    await connectToDatabase();

    let count = 0;
    for (const slug of slugs) {
      const exists = await Submission.exists({ userId, problemSlug: slug, status: "Accepted" });
      if (exists) continue;

      const problem = await Problem.findOne({ slug });
      if (!problem) continue;

      const submission = new Submission({
        problemId: problem._id,
        problemSlug: slug,
        userId,
        userName: "Migrated",
        code: "// migrated from guest session",
        input: "{}",
        output: "",
        status: "Accepted",
        executionTime: "0ms",
      });
      await submission.save();
      count++;
    }

    return NextResponse.json({ migrated: count });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
