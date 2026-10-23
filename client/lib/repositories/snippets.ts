/**
 * Shared playground snippets — facade over mongo/snippets.ts and pg/snippets.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/snippets";
import * as p from "./pg/snippets";
import { pgImpl, read, write } from "./backend";

export const findBySlug = read("snippets.findBySlug", m.findBySlug, pgImpl<typeof m.findBySlug>(p.findBySlug));
/** The mirror reuses Mongo's slug, and reads Mongo's id so both stores agree. */
export const createWithUniqueSlug = write("snippets.createWithUniqueSlug", m.createWithUniqueSlug,
  pgImpl<typeof m.createWithUniqueSlug>(p.createWithUniqueSlug),
  async (slug, _makeSlug, content) => {
    if (!slug) return;
    const doc = await m.findBySlug(slug);
    if (doc) await p.insert(slug, content, { id: String(doc._id), createdAt: doc.createdAt });
  });
