/**
 * Blog posts and votes. Rules ported from the Next.js /api/blog routes:
 * unique slug from the title, author-or-admin delete (votes go with the post),
 * vote counters derived only from the previous vote document — never from the client.
 *
 * Content is raw markdown, sanitised at render time (audit H-1).
 */
import { COIN_RULES } from "@dwcode/shared";
import { config } from "../../config/index.ts";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors/AppError.ts";
import type { BlogRepository } from "../../repositories/blog.repository.ts";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { IdentityProvider } from "../../types/ports.ts";

export type VoteValue = 1 | -1 | 0;

export interface VoteSummary {
  upvotes: number;
  downvotes: number;
  score: number;
  myVote: VoteValue;
}

export function makeSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function toVote(value: number): VoteValue {
  return value === 1 || value === -1 ? value : 0;
}

function counts(blog: { upvotes?: number | null; downvotes?: number | null } | null) {
  // Posts created before the counters existed lack them.
  const upvotes = blog?.upvotes ?? 0;
  const downvotes = blog?.downvotes ?? 0;
  return { upvotes, downvotes, score: upvotes - downvotes };
}

export class BlogService {
  constructor(
    private readonly blogs: BlogRepository,
    private readonly coins: CoinsRepository,
    private readonly identity: IdentityProvider,
  ) {}

  list() {
    return this.blogs.listPublished();
  }

  async get(slug: string) {
    const post = await this.blogs.findPublished(slug);
    if (!post) throw new NotFoundError("Post not found.");
    return post;
  }

  async create(userId: string, input: { title: string; content: string; tags?: string[] | string | undefined }) {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title || !content) throw new BadRequestError("title and content required");

    const baseSlug = makeSlug(title);
    let slug = baseSlug;
    let suffix = 1;
    while (await this.blogs.slugExists(slug)) slug = `${baseSlug}-${suffix++}`;

    const tags = Array.isArray(input.tags)
      ? input.tags
      : (input.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);

    const user = await this.identity.getUser(userId);
    const post = await this.blogs.create({
      title,
      slug,
      content,
      authorId: userId,
      authorName: user?.displayName || "Anonymous",
      authorImageUrl: user?.imageUrl ?? "",
      tags,
    });
    await this.coins.award(userId, COIN_RULES.blogPost, "blog_post", `Published blog: ${title}`);
    return post;
  }

  async delete(userId: string, slug: string): Promise<void> {
    const post = await this.blogs.findAuthor(slug);
    if (!post) throw new NotFoundError("Post not found.");
    if (post.authorId !== userId && !(await this.isAdmin(userId))) {
      throw new ForbiddenError("Only the author or an admin can delete this post.");
    }
    await this.blogs.deleteWithVotes(slug);
  }

  async votes(slug: string, userId: string | undefined): Promise<VoteSummary> {
    const blog = await this.blogs.findPublished(slug);
    if (!blog) throw new NotFoundError("Post not found.");
    const myVote = userId ? toVote(await this.blogs.findVote(slug, userId)) : 0;
    return { ...counts(blog), myVote };
  }

  async vote(slug: string, userId: string, value: VoteValue): Promise<VoteSummary> {
    if (!(await this.blogs.findPublished(slug))) throw new NotFoundError("Post not found.");

    const prev = value === 0 ? await this.blogs.retractVote(slug, userId) : await this.blogs.setVote(slug, userId, value);
    const incUp = (value === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
    const incDown = (value === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
    if (incUp !== 0 || incDown !== 0) await this.blogs.incrementCounters(slug, incUp, incDown);

    // Re-read so the response reflects concurrent votes as well as ours.
    return { ...counts(await this.blogs.findPublished(slug)), myVote: value };
  }

  private async isAdmin(userId: string): Promise<boolean> {
    if (config.superAdminUserId && userId === config.superAdminUserId) return true;
    return this.blogs.hasAdminRole(userId);
  }
}
