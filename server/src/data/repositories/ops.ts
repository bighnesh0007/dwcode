/**
 * Platform and admin records — audit log, moderation, client telemetry and
 * analytics. Facade over mongo/ops.ts and pg/ops.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/ops.ts";
import * as p from "./pg/ops.ts";
import { pgImpl, read, write } from "./backend.ts";

export type { ClientErrorEvent, ModerationInput, NewAuditEntry } from "./mongo/ops.ts";

export const audit = write("ops.audit", m.audit, pgImpl<typeof m.audit>(p.audit),
  (doc, e) => p.audit(e, { id: String(doc._id), createdAt: doc.createdAt }));
export const auditLog = read("ops.auditLog", m.auditLog, pgImpl<typeof m.auditLog>(p.auditLog));
export const moderate = write("ops.moderate", m.moderate, pgImpl<typeof m.moderate>(p.moderate));
export const unmoderate = write("ops.unmoderate", m.unmoderate, p.unmoderate);
export const moderated = read("ops.moderated", m.moderated, pgImpl<typeof m.moderated>(p.moderated));
export const recordError = write("ops.recordError", m.recordError, p.recordError);
export const listErrors = read("ops.listErrors", m.listErrors, pgImpl<typeof m.listErrors>(p.listErrors));
export const resolveError = write("ops.resolveError", m.resolveError, p.resolveError);
export const countOpenErrors = read("ops.countOpenErrors", m.countOpenErrors, p.countOpenErrors);
export const recordPageView = write("ops.recordPageView", m.recordPageView, p.recordPageView);
export const pageViewsSince = read("ops.pageViewsSince", m.pageViewsSince, p.pageViewsSince);
export const userCounts = read("ops.userCounts", m.userCounts, p.userCounts);
export const submissionsByDay = read("ops.submissionsByDay", m.submissionsByDay, p.submissionsByDay);
