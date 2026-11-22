/**
 * Domain module: community — comments, notes, bookmarks, blog.
 * Owns its routes under /api/v1; built from DomainDeps only.
 */
import { CommunityController } from "../controllers/community.controller.ts";
import { BlogRepository } from "../repositories/blog.repository.ts";
import { BookmarkRepository } from "../repositories/bookmark.repository.ts";
import { CoinsRepository } from "../repositories/coins.repository.ts";
import { CommentRepository } from "../repositories/comment.repository.ts";
import { NoteRepository } from "../repositories/note.repository.ts";
import { blogRoutes, bookmarkRoutes, commentRoutes, noteRoutes } from "../routes/v1/community.routes.ts";
import { BlogService } from "../services/community/blog.service.ts";
import { BookmarkService } from "../services/community/bookmark.service.ts";
import { CommentService } from "../services/community/comment.service.ts";
import { NoteService } from "../services/community/note.service.ts";
import type { CommentTarget } from "../repositories/comment.repository.ts";
import { buildNotificationService } from "./notifications.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildCommunityDomain(deps: DomainDeps): DomainModule[] {
  const coins = new CoinsRepository();
  const blog = new BlogRepository();
  const notifier = buildNotificationService();
  /** A blog post's author hears about comments on it (not about their own). */
  const notifyBlogAuthor = async (comment: { userId: string; userName: string; content: string }, target: CommentTarget) => {
    if (target.targetType !== "blog") return;
    const post = await blog.findAuthor(target.targetId);
    if (!post || post.authorId === comment.userId) return;
    await notifier.notify(post.authorId, {
      kind: "comment",
      title: `${comment.userName} commented on your post`,
      body: comment.content.slice(0, 140),
      link: `/blog/${encodeURIComponent(target.targetId)}`,
    });
  };
  const controller = new CommunityController(
    new CommentService(new CommentRepository(), coins, deps.identity, notifyBlogAuthor),
    new NoteService(new NoteRepository()),
    new BookmarkService(new BookmarkRepository()),
    new BlogService(blog, coins, deps.identity),
  );
  const v = deps.tokenVerifier;
  return [
    { path: "/comments", router: commentRoutes(controller, v) },
    { path: "/notes", router: noteRoutes(controller, v) },
    { path: "/bookmarks", router: bookmarkRoutes(controller, v) },
    { path: "/blog", router: blogRoutes(controller, v) },
  ];
}
