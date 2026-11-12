/**
 * Problem-bank CRUD for the /problems API — the secrecy and authorisation rules
 * live in ProblemService. Delegates to data/repositories, where DATA_BACKEND
 * picks the database.
 *
 * Separate from problem.repository.ts (grading/contest reads) so the two
 * callers' projections cannot be confused.
 */
import { DIFFICULTIES } from "@dwcode/shared";
import * as problems from "../data/repositories/problems.ts";

export { isDuplicateKeyError } from "../data/repositories/shared.ts";

export interface NewProblem {
  title: string;
  slug: string;
  difficulty: string;
  category: string;
  description: string;
  tags?: string[];
  examples?: { input: string; output: string; explanation?: string | undefined }[];
  constraints?: string[];
  starterCode?: string;
  testCases?: { input: string; expectedOutput: string }[];
  hiddenTestCases?: { input: string; expectedOutput: string }[];
  solution?: string;
  hints?: string[];
  createdByAI: boolean;
  createdBy: string;
}

export type ProblemPatch = Partial<Omit<NewProblem, "createdByAI" | "createdBy">>;

export class ProblemCatalogRepository {
  list(filter: { difficulty?: string; category?: string }) {
    return problems.listPublic(filter);
  }

  listByCreator(userId: string, limit: number) {
    return problems.listSummariesByCreator(userId, limit);
  }

  summaries(keys: { ids?: string[]; slugs?: string[] }, limit: number) {
    return problems.summariesByIdsOrSlugs(keys, limit);
  }

  /** `{ total, byDifficulty }` for every tier in the shared registry. */
  async stats(): Promise<{ total: number; byDifficulty: Record<string, number> }> {
    const [total, ...counts] = await Promise.all([
      problems.count(),
      ...DIFFICULTIES.map((difficulty) => problems.count({ difficulty })),
    ]);
    return { total, byDifficulty: Object.fromEntries(DIFFICULTIES.map((d, i) => [d, counts[i] ?? 0])) };
  }

  /** By id when the key is one, else by slug — as the Next route did. */
  findByKey(key: string, opts: { includeSecrets: boolean }) {
    return opts.includeSecrets ? problems.findFullByIdOrSlug(key) : problems.findPublicByIdOrSlug(key);
  }

  findSlugById(id: string): Promise<string | null> {
    return problems.findSlugById(id);
  }

  create(data: NewProblem) {
    return problems.create({ ...data });
  }

  /** The updated problem, null when absent, or "duplicate" when the patch collides with another slug. */
  update(id: string, patch: ProblemPatch) {
    return problems.updateById(id, { ...patch });
  }

  delete(id: string): Promise<boolean> {
    return problems.deleteById(id);
  }
}
