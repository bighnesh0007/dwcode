/**
 * Discussion comments for problems and blog posts. Rules ported from the
 * Next.js /api/comments route: author-only delete, a coin per comment (never
 * blocking the post), identity from Clerk rather than the request.
 *
 * Content is stored as raw markdown, exactly as before; it is sanitised where it
 * is rendered (client renderMarkdown, audit H-1), never trusted as HTML.
 */
import { COIN_RULES, LIMITS } from "@dwcode/shared";
import { BadRequestError, ForbiddenError, NotFoundError, PayloadTooLargeError } from "../../errors/AppError.ts";
import { contextLogger } from "../../lib/logger.ts";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { CommentRepository, CommentTarget } from "../../repositories/comment.repository.ts";
import type { IdentityProvider } from "../../types/ports.ts";

export const DEFAULT_COMMENT_LIMIT = 50;

export class CommentService {
  constructor(
    private readonly comments: CommentRepository,
    private readonly coins: CoinsRepository,
    private readonly identity: IdentityProvider,
  ) {}

  list(target: CommentTarget, limit: number | undefined) {
    const capped = limit ? Math.min(limit, LIMITS.pagination.maxLimit) : DEFAULT_COMMENT_LIMIT;
    return this.comments.listForTarget(target, capped);
  }

  async create(userId: string, target: CommentTarget, rawContent: string) {
    const content = rawContent.trim();
    if (!content) throw new BadRequestError("content required");
    if (content.length > LIMITS.comment.maxLength) {
      throw new PayloadTooLargeError(`Comment exceeds ${LIMITS.comment.maxLength} characters.`);
    }
    const user = await this.identity.getUser(userId);
    const comment = await this.comments.create({
      ...target,
      userId,
      userName: user?.displayName || "Anonymous",
      userImageUrl: user?.imageUrl ?? "",
      content,
    });
    try {
      await this.coins.award(userId, COIN_RULES.comment, "comment", "Posted a comment");
    } catch (err) {
      // Coins are non-critical: the comment is already saved.
      contextLogger().warn({ err }, "comment coin award failed");
    }
    return comment;
  }

  async delete(userId: string, id: string): Promise<void> {
    const owner = await this.comments.findOwner(id);
    if (!owner) throw new NotFoundError("Comment not found.");
    if (owner.userId !== userId) throw new ForbiddenError("You can only delete your own comments.");
    await this.comments.deleteById(id);
  }
}
