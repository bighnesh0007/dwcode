/**
 * HTTP adapter for the community domain: comments, notes, bookmarks, blog.
 *
 *   GET    /api/v1/comments?targetType&targetId  (or ?problemSlug)   public
 *   POST   /api/v1/comments                                         auth
 *   DELETE /api/v1/comments/:id                                     author
 *   GET    /api/v1/notes?problemId    PUT /api/v1/notes             auth (own note)
 *   GET    /api/v1/bookmarks          POST /api/v1/bookmarks        optional / auth
 *   GET    /api/v1/blog               POST /api/v1/blog             public / auth
 *   GET    /api/v1/blog/:slug         DELETE /api/v1/blog/:slug     public / author|admin
 *   GET    /api/v1/blog/:slug/vote    POST /api/v1/blog/:slug/vote  optional / auth
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate.ts";
import type { BlogService } from "../services/community/blog.service.ts";
import type { BookmarkService } from "../services/community/bookmark.service.ts";
import type { CommentService } from "../services/community/comment.service.ts";
import type { NoteService } from "../services/community/note.service.ts";
import { created, noContent, ok } from "../utils/respond.ts";
import type {
  CommentListQuery,
  CreateBlogInput,
  CreateCommentInput,
  SaveNoteInput,
  ToggleBookmarkInput,
  VoteInput,
} from "../validation/community.schema.ts";

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Sign in first.");
  return userId;
}

export class CommunityController {
  constructor(
    private readonly comments: CommentService,
    private readonly notes: NoteService,
    private readonly bookmarks: BookmarkService,
    private readonly blogs: BlogService,
  ) {}

  listComments = async (req: Request, res: Response): Promise<void> => {
    const { target, limit } = validatedQuery<CommentListQuery>(req);
    ok(res, await this.comments.list(target, limit));
  };

  createComment = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { target, content } = validatedBody<CreateCommentInput>(req);
    created(res, await this.comments.create(userId, target, content));
  };

  deleteComment = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { id } = validatedParams<{ id: string }>(req);
    await this.comments.delete(userId, id);
    noContent(res);
  };

  getNote = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { problemId } = validatedQuery<{ problemId: string }>(req);
    ok(res, await this.notes.get(userId, problemId));
  };

  saveNote = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const body = validatedBody<SaveNoteInput>(req);
    ok(res, await this.notes.save(userId, body.problemId, body.problemSlug, body.content));
  };

  listBookmarks = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.bookmarks.list(req.auth?.userId));
  };

  toggleBookmark = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const body = validatedBody<ToggleBookmarkInput>(req);
    ok(res, await this.bookmarks.toggle(userId, body.problemId, body.problemSlug));
  };

  listPosts = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.blogs.list());
  };

  createPost = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const body = validatedBody<CreateBlogInput>(req);
    const post = await this.blogs.create(userId, { title: body.title, content: body.content, tags: body.tags });
    created(res, post, `/api/v1/blog/${encodeURIComponent(post.slug)}`);
  };

  getPost = async (req: Request, res: Response): Promise<void> => {
    const { slug } = validatedParams<{ slug: string }>(req);
    ok(res, await this.blogs.get(slug));
  };

  deletePost = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { slug } = validatedParams<{ slug: string }>(req);
    await this.blogs.delete(userId, slug);
    noContent(res);
  };

  getVotes = async (req: Request, res: Response): Promise<void> => {
    const { slug } = validatedParams<{ slug: string }>(req);
    ok(res, await this.blogs.votes(slug, req.auth?.userId));
  };

  vote = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { slug } = validatedParams<{ slug: string }>(req);
    const { value } = validatedBody<VoteInput>(req);
    ok(res, await this.blogs.vote(slug, userId, value));
  };
}
