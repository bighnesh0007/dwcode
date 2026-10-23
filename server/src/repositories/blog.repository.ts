/** Blog post and vote persistence. */
import { Blog } from "../models/Blog.ts";
import { BlogVote } from "../models/BlogVote.ts";
import { UserRole } from "../models/UserRole.ts";

export interface NewBlogPost {
  title: string;
  slug: string;
  content: string;
  authorId: string;
  authorName: string;
  authorImageUrl: string;
  tags: string[];
}

export class BlogRepository {
  listPublished() {
    return Blog.find({ published: true }).sort({ createdAt: -1 }).lean();
  }

  findPublished(slug: string) {
    return Blog.findOne({ slug, published: true }).lean();
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await Blog.exists({ slug })) !== null;
  }

  async create(data: NewBlogPost) {
    const doc = await Blog.create({ ...data, published: true });
    return doc.toObject();
  }

  async findAuthor(slug: string): Promise<{ authorId: string } | null> {
    const doc = await Blog.findOne({ slug }).select("authorId").lean();
    return doc ? { authorId: doc.authorId } : null;
  }

  /** Deletes the post and its votes: slugs are reusable, stale votes must not seed a new post. */
  async deleteWithVotes(slug: string): Promise<void> {
    await Blog.deleteOne({ slug });
    await BlogVote.deleteMany({ blogSlug: slug });
  }

  async hasAdminRole(userId: string): Promise<boolean> {
    return (await UserRole.exists({ userId, role: "admin" })) !== null;
  }

  async findVote(slug: string, userId: string): Promise<number> {
    const vote = await BlogVote.findOne({ blogSlug: slug, userId }).lean();
    return vote?.value ?? 0;
  }

  /** Removes the vote; returns its previous value (0 if none). */
  async retractVote(slug: string, userId: string): Promise<number> {
    const prev = await BlogVote.findOneAndDelete({ blogSlug: slug, userId }).lean();
    return prev?.value ?? 0;
  }

  /**
   * Upserts the vote and returns the PREVIOUS value (0 when this call inserted).
   * The retry keeps upsert: a retry without it could race a concurrent retract
   * and $inc a counter with no vote document behind it.
   */
  async setVote(slug: string, userId: string, value: 1 | -1): Promise<number> {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        const prev = await BlogVote.findOneAndUpdate(
          { blogSlug: slug, userId },
          { $set: { value } },
          { upsert: true, returnDocument: "before" },
        ).lean();
        return prev?.value ?? 0;
      } catch (error) {
        // E11000: a concurrent insert from the same user won; retrying converges.
        if (!isDuplicateKeyError(error) || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  async incrementCounters(slug: string, up: number, down: number): Promise<void> {
    await Blog.updateOne({ slug }, { $inc: { upvotes: up, downvotes: down } });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
