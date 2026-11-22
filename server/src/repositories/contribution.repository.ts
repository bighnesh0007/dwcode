/** Community contributions (SFCode parity, Phase E) — delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as contributions from "../data/repositories/contributions.ts";
import type { ContributionPatch, NewContribution } from "../data/repositories/contributions.ts";

export type ContributionDoc = NonNullable<Awaited<ReturnType<typeof contributions.findById>>>;

export class ContributionRepository {
  create(c: NewContribution) {
    return contributions.create(c);
  }
  findById(id: string) {
    return contributions.findById(id);
  }
  listByAuthor(authorId: string, limit: number) {
    return contributions.listByAuthor(authorId, limit);
  }
  listByStatus(status: string, kind: string | undefined, limit: number) {
    return contributions.listByStatus(status, kind, limit);
  }
  countByAuthor(authorId: string, kind: string, statuses: string[]) {
    return contributions.countByAuthor(authorId, kind, statuses);
  }
  transition(id: string, from: string[], patch: ContributionPatch) {
    return contributions.transition(id, from, patch);
  }
  removeDraft(id: string, authorId: string) {
    return contributions.removeDraft(id, authorId);
  }
}
