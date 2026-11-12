/**
 * Problem persistence for background jobs — no business rules. Delegates to
 * data/repositories, where DATA_BACKEND picks the database.
 */
import type mongoose from "mongoose";
import type { Example, TestCase } from "@dwcode/shared";
import * as problems from "../data/repositories/problems.ts";

export interface GradableProblem {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
  testCases: TestCase[];
  examples: Example[];
  hiddenTestCases: TestCase[];
}

/** The minimal projection the weekly-contest scheduler needs. */
export interface SampledProblem {
  _id: mongoose.Types.ObjectId;
  slug: string;
  difficulty: string;
}

export class ProblemRepository {
  /** Uniformly sample up to `n` problems of the given difficulty. */
  async sampleByDifficulty(difficulty: string, n: number): Promise<SampledProblem[]> {
    return (await problems.sample(n, { difficulty })) as SampledProblem[];
  }

  /** Uniformly sample up to `n` problems of any difficulty, excluding `excludeIds`. */
  async sampleAny(n: number, excludeIds: mongoose.Types.ObjectId[]): Promise<SampledProblem[]> {
    return (await problems.sample(n, { excludeIds })) as SampledProblem[];
  }

  /** Everything grading needs, and nothing else — never the solution. */
  async findForGrading(id: string): Promise<GradableProblem | null> {
    if (!problems.isValidId(id)) return null;
    const p = await problems.findForGrading(id);
    if (!p) return null;
    return {
      id: String(p._id),
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      testCases: (p.testCases ?? []).map((t) => ({ input: t.input, expectedOutput: t.expectedOutput })),
      examples: (p.examples ?? []).map((e) => ({ input: e.input, output: e.output })),
      hiddenTestCases: (p.hiddenTestCases ?? []).map((t) => ({ input: t.input, expectedOutput: t.expectedOutput })),
    };
  }

  async findSummariesBySlugs(slugs: string[]): Promise<{ title: string; slug: string; difficulty: string }[]> {
    const rows = await problems.summariesForSlugs(slugs);
    return rows.map((r) => ({ title: r.title, slug: r.slug, difficulty: r.difficulty }));
  }
}
