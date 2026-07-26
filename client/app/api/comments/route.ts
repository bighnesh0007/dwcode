import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import mongoose from "mongoose";
import { COIN_RULES, LIMITS } from "@dwcode/shared";
import connectToDatabase from "@/lib/db";
import { Comment, COMMENT_TARGET_TYPES, type CommentTargetType } from "@/models/Comment";
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

interface Target {
  targetType: CommentTargetType;
  targetId: string;
}

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

/**
 * Match documents written BEFORE and AFTER migration 002.
 *
 * A problem comment written by the previous release has `problemSlug` but no
 * `targetId`. Until 002 has run, querying `targetId` alone would make every
 * existing discussion vanish from the UI.
 */
function matchFor(target: Target): Record<string, unknown> {
  if (target.targetType === "problem") {
    return {
      $or: [
        { targetType: "problem", targetId: target.targetId },
        { targetId: { $exists: false }, problemSlug: target.targetId },
      ],
    };
  }
  return { targetType: target.targetType, targetId: target.targetId };
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

    await connectToDatabase();
    const comments = await Comment.find(matchFor(target))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(comments);
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

    await connectToDatabase();
    const comment = new Comment({
      targetType: target.targetType,
      targetId: target.targetId,
      // Dual-write during the 002 rollout so the previous release still sees it.
      ...(target.targetType === "problem" ? { problemSlug: target.targetId } : {}),
      userId,
      userName: user?.fullName || user?.username || "Anonymous",
      userImageUrl: user?.imageUrl || "",
      content,
    });
    await comment.save();

    // Award a coin for commenting.
    try {
      const { awardCoins } = await import("@/lib/coins");
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
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "valid id required" }, { status: 400 });
    }

    await connectToDatabase();
    const comment = await Comment.findById(id);
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (comment.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await Comment.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
