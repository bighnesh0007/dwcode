import type { InferSchemaType } from "mongoose";
import { PlaygroundSnippet, type PlaygroundSnippetSchema } from "@/models/PlaygroundSnippet";
import { connect, isDuplicateKeyError } from "./shared";

type SnippetContent = Pick<InferSchemaType<typeof PlaygroundSnippetSchema>, "script" | "files" | "testCases">;

/**
 * Store a shared snippet under a fresh random slug, retrying if a slug collides
 * with an existing one. Returns the slug, or null if every attempt collided.
 */
export async function createWithUniqueSlug(
  makeSlug: () => string,
  content: SnippetContent,
  attempts = 5,
): Promise<string | null> {
  await connect();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const doc = await PlaygroundSnippet.create({ slug: makeSlug(), ...content });
      return doc.slug;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  return null;
}

export async function findBySlug(slug: string) {
  await connect();
  return PlaygroundSnippet.findOne({ slug }).lean();
}
