/** Platform and admin records (Phase F) — delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as ops from "../data/repositories/ops.ts";
import type { ClientErrorEvent, ModerationInput, NewAuditEntry } from "../data/repositories/ops.ts";

export class OpsRepository {
  audit(e: NewAuditEntry) { return ops.audit(e); }
  auditLog(limit: number, before?: Date) { return ops.auditLog(limit, before); }
  moderate(kind: string, ref: string, m: ModerationInput) { return ops.moderate(kind, ref, m); }
  unmoderate(kind: string, ref: string) { return ops.unmoderate(kind, ref); }
  moderated(kind: string, now: Date) { return ops.moderated(kind, now); }
  recordError(e: ClientErrorEvent, at: Date) { return ops.recordError(e, at); }
  listErrors(resolved: boolean, limit: number) { return ops.listErrors(resolved, limit); }
  resolveError(fingerprint: string) { return ops.resolveError(fingerprint); }
  countOpenErrors() { return ops.countOpenErrors(); }
  recordPageView(day: string, path: string) { return ops.recordPageView(day, path); }
  pageViewsSince(day: string) { return ops.pageViewsSince(day); }
  userCounts(since: Date) { return ops.userCounts(since); }
  submissionsByDay(since: Date) { return ops.submissionsByDay(since); }
}
