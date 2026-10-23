/**
 * Submissions — facade over mongo/submissions.ts and pg/submissions.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/submissions";
import * as p from "./pg/submissions";
import { pgImpl, read, write } from "./backend";

export type { NewSubmission, SubmissionUserStats } from "./mongo/submissions";
export const listByUser = read("submissions.listByUser", m.listByUser, pgImpl<typeof m.listByUser>(p.listByUser));
export const listAll = read("submissions.listAll", m.listAll, pgImpl<typeof m.listAll>(p.listAll));
export const create = write("submissions.create", m.create, pgImpl<typeof m.create>(p.create),
  (doc, submission) => p.create(submission, { id: String(doc._id), createdAt: doc.createdAt }));
export const hasOtherAccepted = read("submissions.hasOtherAccepted", m.hasOtherAccepted, p.hasOtherAccepted);
export const hasAcceptedForSlug = read("submissions.hasAcceptedForSlug", m.hasAcceptedForSlug, p.hasAcceptedForSlug);
export const slugsByOutcome = read("submissions.slugsByOutcome", m.slugsByOutcome, p.slugsByOutcome,
  { unordered: ["accepted", "notAccepted"] });
export const statsByUser = read("submissions.statsByUser", m.statsByUser, p.statsByUser, { unordered: ["solvedSlugs"] });
