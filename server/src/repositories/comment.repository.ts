/** Comment persistence. Mongoose queries only — no business rules. */
import mongoose from "mongoose";
import { Comment, type CommentTargetType } from "../models/Comment.ts";

export interface CommentTarget {
  targetType: CommentTargetType;
  targetId: string;
}

export interface NewComment extends CommentTarget {
  userId: string;
  userName: string;
  userImageUrl: string;
  content: string;
}

/**
 * Match documents written BEFORE and AFTER migration 002: a problem comment from
 * the previous release has `problemSlug` but no `targetId`.
 */
function matchFor(target: CommentTarget): Record<string, unknown> {
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

export class CommentRepository {
  /** Newest first. Served by { targetType, targetId, createdAt }. */
  listForTarget(target: CommentTarget, limit: number) {
    return Comment.find(matchFor(target)).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async create(data: NewComment) {
    const doc = await Comment.create({
      targetType: data.targetType,
      targetId: data.targetId,
      // Dual-write during the 002 rollout so the previous release still sees it.
      ...(data.targetType === "problem" ? { problemSlug: data.targetId } : {}),
      userId: data.userId,
      userName: data.userName,
      userImageUrl: data.userImageUrl,
      content: data.content,
    });
    return doc.toObject();
  }

  async findOwner(id: string): Promise<{ userId: string } | null> {
    const doc = await Comment.findById(new mongoose.Types.ObjectId(id)).select("userId").lean();
    return doc ? { userId: doc.userId } : null;
  }

  async deleteById(id: string): Promise<void> {
    await Comment.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
  }
}
