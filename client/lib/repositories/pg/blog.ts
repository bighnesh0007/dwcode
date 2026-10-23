import { and, desc, eq, sql } from "drizzle-orm";
import { blogs, blogVotes } from "@/db/postgres/schema";
import { db, oid } from "./db";

type Row = typeof blogs.$inferSelect;
const toDoc = ({ id, ...row }: Row) => ({ _id: oid(id), ...row });

async function one(where: ReturnType<typeof eq> | undefined) {
  const rows = await db().select().from(blogs).where(where).limit(1);
  return rows[0] ? toDoc(rows[0]) : null;
}

export async function listPublished() {
  const rows = await db().select().from(blogs).where(eq(blogs.published, true)).orderBy(desc(blogs.createdAt));
  return rows.map(toDoc);
}

export const findPublished = (slug: string) => one(and(eq(blogs.slug, slug), eq(blogs.published, true)));

export const findBySlug = (slug: string) => one(eq(blogs.slug, slug));

export async function slugExists(slug: string): Promise<boolean> {
  return Boolean(await findBySlug(slug));
}

export async function create(
  post: {
    title: string;
    slug: string;
    content: string;
    authorId: string;
    authorName: string;
    authorImageUrl: string;
    tags: string[];
    published: boolean;
  },
  preset?: { id: string; createdAt: Date },
) {
  const [row] = await db().insert(blogs).values({
    ...post, ...(preset && { id: preset.id, createdAt: preset.createdAt, updatedAt: preset.createdAt }),
  }).returning();
  return toDoc(row);
}

/** Votes are keyed by blog id and cascade, so a recycled slug starts clean. */
export async function deleteWithVotes(slug: string) {
  await db().delete(blogs).where(eq(blogs.slug, slug));
}

const blogId = (slug: string) => sql`(select ${blogs.id} from ${blogs} where ${blogs.slug} = ${slug})`;

export async function findVoteValue(slug: string, userId: string): Promise<number> {
  const rows = await db().select({ value: blogVotes.value }).from(blogVotes)
    .where(and(eq(blogVotes.blogId, blogId(slug)), eq(blogVotes.userId, userId)));
  return rows[0]?.value ?? 0;
}

export async function retractVote(slug: string, userId: string): Promise<number> {
  const rows = await db().delete(blogVotes)
    .where(and(eq(blogVotes.blogId, blogId(slug)), eq(blogVotes.userId, userId)))
    .returning({ value: blogVotes.value });
  return rows[0]?.value ?? 0;
}

/**
 * Set the user's vote; returns the previous value (0 if this inserted it).
 * The row is locked for the read-then-write, so a concurrent cast or retract
 * by the same user cannot interleave and leave the counters drifting.
 */
export async function castVote(slug: string, userId: string, value: number): Promise<number> {
  return db().transaction(async (t) => {
    const [blog] = await t.select({ id: blogs.id }).from(blogs).where(eq(blogs.slug, slug));
    if (!blog) throw new Error(`No blog post with slug ${slug}`);
    const prev = await t.select({ value: blogVotes.value }).from(blogVotes)
      .where(and(eq(blogVotes.blogId, blog.id), eq(blogVotes.userId, userId))).for("update");
    await t.insert(blogVotes).values({ blogId: blog.id, userId, value })
      .onConflictDoUpdate({ target: [blogVotes.blogId, blogVotes.userId], set: { value, updatedAt: new Date() } });
    return prev[0]?.value ?? 0;
  });
}

export async function adjustVoteCounts(slug: string, upvotes: number, downvotes: number) {
  await db().update(blogs).set({
    upvotes: sql`${blogs.upvotes} + ${upvotes}`,
    downvotes: sql`${blogs.downvotes} + ${downvotes}`,
  }).where(eq(blogs.slug, slug));
}
