/**
 * Comments on problems and blog posts — facade over mongo/comments.ts and pg/comments.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/comments";
import * as p from "./pg/comments";
import { pgImpl, read, write } from "./backend";

export { COMMENT_TARGET_TYPES } from "./mongo/comments";
export type { CommentTargetType, CommentTarget, CommentUserStats } from "./mongo/comments";
export const listForTarget = read("comments.listForTarget", m.listForTarget,
  pgImpl<typeof m.listForTarget>(p.listForTarget));
export const create = write("comments.create", m.create, pgImpl<typeof m.create>(p.create),
  (doc, target, author, content) => p.create(target, author, content, { id: String(doc._id), createdAt: doc.createdAt }));
export const findAuthorId = read("comments.findAuthorId", m.findAuthorId, p.findAuthorId);
export const deleteById = write("comments.deleteById", m.deleteById, p.deleteById);
export const statsByUser = read("comments.statsByUser", m.statsByUser, p.statsByUser);
