import { NextResponse } from "next/server";
import * as problems from "@/lib/repositories/problems";
import { WRITABLE_PROBLEM_FIELDS, slugify } from "@/lib/problemFields";
import { requireAdmin } from "@/lib/adminCheck";
import { getErrorMessage } from "@/lib/errors";

// Fields a PUT may change: WRITABLE_PROBLEM_FIELDS (lib/problemFields.ts).
// This used to be `findByIdAndUpdate(id, req.body)` with the RAW body, which let
// a caller set any field — including provenance (audit finding H-5).

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Accepts either an id or a slug.
    const problem = await problems.findPublicByIdOrSlug(id);

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
    if (!problems.isValidId(id)) {
      return NextResponse.json({ success: false, error: "Problem not found" }, { status: 404 });
    }

    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    }

    // Copy across only the fields a caller is allowed to set.
    const update: Record<string, unknown> = {};
    for (const field of WRITABLE_PROBLEM_FIELDS) {
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

    const updated = await problems.updateById(id, update);
    // Another problem already owns the derived slug.
    if (updated === "duplicate") {
      return NextResponse.json(
        { success: false, error: "A problem with that title already exists" },
        { status: 409 },
      );
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
    if (!problems.isValidId(id)) {
      return NextResponse.json({ success: false, error: "Problem not found" }, { status: 404 });
    }

    if (!(await problems.deleteById(id))) {
      return NextResponse.json({ success: false, error: "Problem not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
