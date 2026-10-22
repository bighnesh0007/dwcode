import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { COIN_RULES, LIMITS } from "@dwcode/shared";
import { awardCoins } from "@/lib/coins";
import * as comments from "@/lib/repositories/comments";
import { COMMENT_TARGET_TYPES, type CommentTarget, type CommentTargetType } from "@/lib/repositories/comments";
import { isValidId } from "@/lib/repositories/shared";
import { getErrorMessage } from "@/lib/errors";

/**
 * Discussion comments for problems AND blog posts.
 *
 * Both request shapes are accepted during the migration-002 rollout:
 *   NEW  ?targetType=blog&targetId=my-post  /  { targetType, targetId, content }
 *   OLD  ?problemSlug=foo                   /  { problemSlug, content }
 *
 * The old shape means `targetType: "problem"`. Keeping it means a browser still
 * running the previous release's JS does not break mid-deploy.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = LIMITS.pagination.maxLimit;

type Target = CommentTarget;

function isTargetType(value: unknown): value is CommentTargetType {
  return typeof value === "string" && (COMMENT_TARGET_TYPES as readonly string[]).includes(value);
}

/** Resolve a target from either the new or the legacy shape. */
function resolveTarget(source: {
  targetType?: unknown;
  targetId?: unknown;
  problemSlug?: unknown;
}): Target | null {
  if (
    isTargetType(source.targetType) &&
    typeof source.targetId === "string" &&
    source.targetId.trim()
  ) {
    return { targetType: source.targetType, targetId: source.targetId.trim() };
  }
  // Legacy: a bare problemSlug means a problem comment.
  if (typeof source.problemSlug === "string" && source.problemSlug.trim()) {
    return { targetType: "problem", targetId: source.problemSlug.trim() };
  }
  return null;
}

// GET /api/comments?targetType=blog&targetId=slug   (or ?problemSlug=slug)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const target = resolveTarget({
      targetType: searchParams.get("targetType"),
      targetId: searchParams.get("targetId"),
      problemSlug: searchParams.get("problemSlug"),
    });
    if (!target) {
      return NextResponse.json(
        { error: "targetType + targetId (or problemSlug) required" },
        { status: 400 },
      );
    }

    const requested = Number(searchParams.get("limit"));
    const limit =
      Number.isInteger(requested) && requested > 0
        ? Math.min(requested, MAX_LIMIT)
        : DEFAULT_LIMIT;

    return NextResponse.json(await comments.listForTarget(target, limit));
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// POST /api/comments  { targetType, targetId, content }  (or { problemSlug, content })
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await currentUser();
    const body = await req.json();

    const target = resolveTarget(body ?? {});
    if (!target) {
      return NextResponse.json(
        { error: "targetType + targetId (or problemSlug) required" },
        { status: 400 },
      );
    }

    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }
    if (content.length > LIMITS.comment.maxLength) {
      return NextResponse.json(
        { error: `Comment exceeds ${LIMITS.comment.maxLength} characters.` },
        { status: 413 },
      );
    }

    const comment = await comments.create(
      target,
      {
        userId,
        userName: user?.fullName || user?.username || "Anonymous",
        userImageUrl: user?.imageUrl || "",
      },
      content,
    );

    // Award a coin for commenting.
    try {
      await awardCoins(userId, COIN_RULES.comment, "comment", "Posted a comment");
    } catch {
      /* coins are non-critical */
    }

    return NextResponse.json({ success: true, comment });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

// DELETE /api/comments?id=xxx — author only.
export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!isValidId(id)) {
      return NextResponse.json({ error: "valid id required" }, { status: 400 });
    }

    const authorId = await comments.findAuthorId(id);
    if (authorId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (authorId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await comments.deleteById(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
