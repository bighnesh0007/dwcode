import { Blog } from "@/models/Blog";
import { BlogVote } from "@/models/BlogVote";
import { connect, isDuplicateKeyError } from "../shared";

export async function listPublished() {
  await connect();
  return Blog.find({ published: true }).sort({ createdAt: -1 }).lean();
}

export async function findPublished(slug: string) {
  await connect();
  return Blog.findOne({ slug, published: true }).lean();
}

/** Published or not — for authorisation checks. */
export async function findBySlug(slug: string) {
  await connect();
  return Blog.findOne({ slug }).lean();
}

export async function slugExists(slug: string): Promise<boolean> {
  await connect();
  return Boolean(await Blog.exists({ slug }));
}

export async function create(post: {
  title: string;
  slug: string;
  content: string;
  authorId: string;
  authorName: string;
  authorImageUrl: string;
  tags: string[];
  published: boolean;
}) {
  await connect();
  const doc = await Blog.create(post);
  return doc.toObject();
}

/**
 * Delete a post and its votes. Votes are keyed by slug, and slugs are reusable:
 * stale votes on a recycled slug would seed the new post with counts its author
 * never earned, and retracting one could drive the counters negative.
 */
export async function deleteWithVotes(slug: string) {
  await connect();
  await Blog.deleteOne({ slug });
  await BlogVote.deleteMany({ blogSlug: slug });
}

/** The user's current vote: 1, -1, or 0 for none. */
export async function findVoteValue(slug: string, userId: string): Promise<number> {
  await connect();
  const vote = await BlogVote.findOne({ blogSlug: slug, userId }).lean();
  return vote?.value ?? 0;
}

/** Remove the user's vote; returns the value it had (0 if none). */
export async function retractVote(slug: string, userId: string): Promise<number> {
  await connect();
  const prev = await BlogVote.findOneAndDelete({ blogSlug: slug, userId }).lean();
  return prev?.value ?? 0;
}

/**
 * Set the user's vote; returns the previous value (0 if this inserted it).
 *
 * The retry MUST keep upsert: true. A retry without it can race a concurrent
 * retract from the same user: the retract deletes the just-inserted vote, the
 * upsert-less retry matches nothing and persists NO vote, yet a null previous
 * would read as "first vote" and increment a counter with nothing backing it —
 * permanent drift. With upsert kept, null genuinely means this call inserted it.
 */
export async function castVote(slug: string, userId: string, value: number): Promise<number> {
  await connect();
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      const prev = await BlogVote.findOneAndUpdate(
        { blogSlug: slug, userId },
        { $set: { value } },
        { upsert: true, returnDocument: "before" },
      ).lean();
      return prev?.value ?? 0;
    } catch (err) {
      // A concurrent insert from the same user won this exact moment; retrying
      // (still with upsert) converges.
      if (!isDuplicateKeyError(err) || attempt >= MAX_ATTEMPTS) throw err;
    }
  }
}

/** Adjust the denormalised vote counters by the given deltas. */
export async function adjustVoteCounts(slug: string, upvotes: number, downvotes: number) {
  await connect();
  await Blog.updateOne({ slug }, { $inc: { upvotes, downvotes } });
}
