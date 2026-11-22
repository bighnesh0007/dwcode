/**
 * Community contributions — facade over mongo/contributions.ts and pg/contributions.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/contributions.ts";
import * as p from "./pg/contributions.ts";
import { pgImpl, read, write } from "./backend.ts";

export type { ContributionPatch, NewContribution } from "./mongo/contributions.ts";

export const create = write("contributions.create", m.create, pgImpl<typeof m.create>(p.create),
  (doc, c) => p.create(c, { id: String(doc._id), createdAt: doc.createdAt }));
export const findById = read("contributions.findById", m.findById, pgImpl<typeof m.findById>(p.findById));
export const listByAuthor = read("contributions.listByAuthor", m.listByAuthor, pgImpl<typeof m.listByAuthor>(p.listByAuthor));
export const listByStatus = read("contributions.listByStatus", m.listByStatus, pgImpl<typeof m.listByStatus>(p.listByStatus));
export const countByAuthor = read("contributions.countByAuthor", m.countByAuthor, p.countByAuthor);
export const transition = write("contributions.transition", m.transition, pgImpl<typeof m.transition>(p.transition));
export const removeDraft = write("contributions.removeDraft", m.removeDraft, p.removeDraft);
