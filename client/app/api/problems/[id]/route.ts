import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/adminCheck";
import { getErrorMessage } from "@/lib/errors";

/**
 * Fields a PUT is allowed to change.
 *
 * This used to be `findByIdAndUpdate(id, req.body)` with the RAW body, which let
 * a caller set any schema field — including `createdBy`, `createdAt` and
 * `createdByAI`. Provenance is server-owned, so it is absent here and a request
 * carrying it is ignored rather than rejected (audit finding H-5).
 *
 * `slug` is deliberately absent too: it is derived from `title` below, never
 * taken from the caller.
 */
const MUTABLE_FIELDS = [
  "title",
  "difficulty",
  "category",
  "tags",
  "description",
  "examples",
  "constraints",
  "starterCode",
  "testCases",
  "hiddenTestCases",
  "solution",
  "hints",
] as const;

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

/** MongoDB duplicate-key error (unique index violation). */
function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await connectToDatabase();

    // Check if the id is a valid MongoDB ObjectId. If yes, query by _id, else query by slug.
    let query = {};
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      query = { slug: id };
    }

    const problem = await Problem.findOne(query).select("-hiddenTestCases -solution");

    if (!problem) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    return NextResponse.json(problem);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * PUT /api/problems/:id — admin only.
 *
 * Was UNAUTHENTICATED (audit finding C-1): anyone could rewrite any problem,
 * including its `solution` and `hiddenTestCases`.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Problem not found" }, { status: 404 });
    }

    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    }

    // Copy across only the fields a caller is allowed to set.
    const update: Record<string, unknown> = {};
    for (const field of MUTABLE_FIELDS) {
      if (field in body) update[field] = (body as Record<string, unknown>)[field];
    }

    // Derive the slug from the new title, never from the request.
    if (typeof update.title === "string") {
      const slug = slugify(update.title);
      if (!slug) {
        return NextResponse.json(
          { success: false, error: "Title must contain at least one alphanumeric character" },
          { status: 400 },
        );
      }
      update.slug = slug;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { success: false, error: "No updatable fields supplied" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    let updated;
    try {
      updated = await Problem.findByIdAndUpdate(
        id,
        { $set: update },
        { new: true, runValidators: true },
      );
    } catch (error) {
      // Another problem already owns the derived slug.
      if (isDuplicateKeyError(error)) {
        return NextResponse.json(
          { success: false, error: "A problem with that title already exists" },
          { status: 409 },
        );
      }
      throw error;
    }

    if (!updated) {
      return NextResponse.json({ success: false, error: "Problem not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, problem: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/problems/:id — admin only.
 *
 * Was UNAUTHENTICATED (audit finding C-1): `curl -X DELETE` removed a problem
 * with no credentials of any kind.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Problem not found" }, { status: 404 });
    }

    await connectToDatabase();
    const deleted = await Problem.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Problem not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
