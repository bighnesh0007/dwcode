/**
 * Blog posts and votes — facade over mongo/blog.ts and pg/blog.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/blog";
import * as p from "./pg/blog";
import { pgImpl, read, write } from "./backend";

export const listPublished = read("blog.listPublished", m.listPublished, pgImpl<typeof m.listPublished>(p.listPublished));
export const findPublished = read("blog.findPublished", m.findPublished, pgImpl<typeof m.findPublished>(p.findPublished));
export const findBySlug = read("blog.findBySlug", m.findBySlug, pgImpl<typeof m.findBySlug>(p.findBySlug));
export const slugExists = read("blog.slugExists", m.slugExists, p.slugExists);
export const create = write("blog.create", m.create, pgImpl<typeof m.create>(p.create),
  (doc, post) => p.create(post, { id: String(doc._id), createdAt: doc.createdAt }));
export const deleteWithVotes = write("blog.deleteWithVotes", m.deleteWithVotes, p.deleteWithVotes);
export const findVoteValue = read("blog.findVoteValue", m.findVoteValue, p.findVoteValue);
export const retractVote = write("blog.retractVote", m.retractVote, p.retractVote);
export const castVote = write("blog.castVote", m.castVote, p.castVote);
export const adjustVoteCounts = write("blog.adjustVoteCounts", m.adjustVoteCounts, p.adjustVoteCounts);
