/**
 * Problem persistence for background jobs. Mongoose queries only — no business
 * rules here.
 */
import mongoose from "mongoose";
import type { Example, TestCase } from "@dwcode/shared";
import { Problem } from "../models/Problem.ts";

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
    return Problem.aggregate<SampledProblem>([
      { $match: { difficulty } },
      { $sample: { size: n } },
      { $project: { _id: 1, slug: 1, difficulty: 1 } },
    ]);
  }

  /** Uniformly sample up to `n` problems of any difficulty, excluding `excludeIds`. */
  async sampleAny(n: number, excludeIds: mongoose.Types.ObjectId[]): Promise<SampledProblem[]> {
    return Problem.aggregate<SampledProblem>([
      { $match: { _id: { $nin: excludeIds } } },
      { $sample: { size: n } },
      { $project: { _id: 1, slug: 1, difficulty: 1 } },
    ]);
  }

  /** Everything grading needs, and nothing else — never the solution. */
  async findForGrading(id: string): Promise<GradableProblem | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const p = await Problem.findById(id).select("title slug difficulty testCases examples hiddenTestCases").lean();
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
    const rows = await Problem.find({ slug: { $in: slugs } }).select("title slug difficulty").lean();
    return rows.map((r) => ({ title: r.title, slug: r.slug, difficulty: r.difficulty }));
  }
}
