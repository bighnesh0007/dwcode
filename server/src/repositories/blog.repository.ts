/** Blog post and vote persistence. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as blog from "../data/repositories/blog.ts";
import { hasAdminRole } from "../data/repositories/roles.ts";

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
    return blog.listPublished();
  }

  findPublished(slug: string) {
    return blog.findPublished(slug);
  }

  slugExists(slug: string): Promise<boolean> {
    return blog.slugExists(slug);
  }

  create(data: NewBlogPost) {
    return blog.create({ ...data, published: true });
  }

  async findAuthor(slug: string): Promise<{ authorId: string } | null> {
    const doc = await blog.findBySlug(slug);
    return doc ? { authorId: doc.authorId } : null;
  }

  /** Deletes the post and its votes: slugs are reusable, stale votes must not seed a new post. */
  deleteWithVotes(slug: string): Promise<void> {
    return blog.deleteWithVotes(slug);
  }

  hasAdminRole(userId: string): Promise<boolean> {
    return hasAdminRole(userId);
  }

  findVote(slug: string, userId: string): Promise<number> {
    return blog.findVoteValue(slug, userId);
  }

  /** Removes the vote; returns its previous value (0 if none). */
  retractVote(slug: string, userId: string): Promise<number> {
    return blog.retractVote(slug, userId);
  }

  /** Upserts the vote and returns the PREVIOUS value (0 when this call inserted). */
  setVote(slug: string, userId: string, value: 1 | -1): Promise<number> {
    return blog.castVote(slug, userId, value);
  }

  incrementCounters(slug: string, up: number, down: number): Promise<void> {
    return blog.adjustVoteCounts(slug, up, down);
  }
}
