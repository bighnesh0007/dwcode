/** Comment persistence — no business rules. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import type { CommentTargetType } from "../models/Comment.ts";
import * as comments from "../data/repositories/comments.ts";

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


export class CommentRepository {
  /** Newest first; also matches problem comments written before migration 002. */
  listForTarget(target: CommentTarget, limit: number) {
    return comments.listForTarget(target, limit);
  }

  /** Dual-writes `problemSlug` for problem comments during the 002 rollout. */
  create(data: NewComment) {
    return comments.create(
      { targetType: data.targetType, targetId: data.targetId },
      { userId: data.userId, userName: data.userName, userImageUrl: data.userImageUrl },
      data.content,
    );
  }

  async findOwner(id: string): Promise<{ userId: string } | null> {
    const userId = await comments.findAuthorId(id);
    return userId === null ? null : { userId };
  }

  deleteById(id: string): Promise<void> {
    return comments.deleteById(id);
  }
}
