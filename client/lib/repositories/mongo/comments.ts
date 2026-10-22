import { Comment, COMMENT_TARGET_TYPES, type CommentTargetType } from "@/models/Comment";
import { connect } from "../shared";

export { COMMENT_TARGET_TYPES, type CommentTargetType };

export interface CommentTarget {
  targetType: CommentTargetType;
  targetId: string;
}

/**
 * Match comments written BEFORE and AFTER migration 002.
 *
 * A problem comment written by the previous release has `problemSlug` but no
 * `targetId`. Until 002 has run, querying `targetId` alone would make every
 * existing discussion vanish from the UI.
 */
function matchFor(target: CommentTarget) {
  if (target.targetType === "problem") {
    return {
      $or: [
        { targetType: "problem" as const, targetId: target.targetId },
        { targetId: { $exists: false }, problemSlug: target.targetId },
      ],
    };
  }
  return { targetType: target.targetType, targetId: target.targetId };
}

/** A target's comments, newest first. */
export async function listForTarget(target: CommentTarget, limit: number) {
  await connect();
  return Comment.find(matchFor(target)).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function create(target: CommentTarget, author: {
  userId: string;
  userName: string;
  userImageUrl: string;
}, content: string) {
  await connect();
  const doc = await Comment.create({
    targetType: target.targetType,
    targetId: target.targetId,
    // Dual-write during the 002 rollout so the previous release still sees it.
    ...(target.targetType === "problem" ? { problemSlug: target.targetId } : {}),
    ...author,
    content,
  });
  return doc.toObject();
}

export async function findAuthorId(id: string): Promise<string | null> {
  await connect();
  const doc = await Comment.findById(id).select("userId").lean();
  return doc ? doc.userId : null;
}

export async function deleteById(id: string) {
  await connect();
  await Comment.findByIdAndDelete(id);
}

export interface CommentUserStats {
  _id: string;
  count: number;
  userName?: string;
  userImageUrl?: string;
}

/** Per-user comment counts — for the admin directory. */
export async function statsByUser() {
  await connect();
  return Comment.aggregate<CommentUserStats>([
    {
      $group: {
        _id: "$userId",
        count: { $sum: 1 },
        userName: { $last: "$userName" },
        userImageUrl: { $last: "$userImageUrl" },
      },
    },
  ]);
}
