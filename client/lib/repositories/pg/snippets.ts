import { eq } from "drizzle-orm";
import { playgroundSnippets, type PlaygroundFile, type PlaygroundTestCase } from "@/db/postgres/schema";
import { isDuplicateKeyError } from "../shared";
import { db, oid } from "./db";

interface SnippetContent {
  script: string;
  files: PlaygroundFile[];
  testCases: PlaygroundTestCase[];
}

/** Insert one snippet; `preset` carries Mongo's id and time when mirroring. */
export async function insert(slug: string, content: SnippetContent, preset?: { id: string; createdAt: Date }) {
  await db().insert(playgroundSnippets).values({
    slug, ...content,
    ...(preset && { id: preset.id, createdAt: preset.createdAt, updatedAt: preset.createdAt }),
  });
}

export async function createWithUniqueSlug(
  makeSlug: () => string,
  content: SnippetContent,
  attempts = 5,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const slug = makeSlug();
    try {
      await insert(slug, content);
      return slug;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  return null;
}

export async function findBySlug(slug: string) {
  const rows = await db().select().from(playgroundSnippets).where(eq(playgroundSnippets.slug, slug));
  const row = rows[0];
  if (!row) return null;
  const { id, ...rest } = row;
  return { _id: oid(id), ...rest };
}
