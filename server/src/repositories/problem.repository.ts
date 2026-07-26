/**
 * Problem persistence for background jobs. Mongoose queries only — no business
 * rules here.
 */
import type mongoose from "mongoose";
import type { Difficulty } from "../config/constants.ts";
import { Problem } from "../models/Problem.ts";

/** The minimal projection the weekly-contest scheduler needs. */
export interface SampledProblem {
  _id: mongoose.Types.ObjectId;
  slug: string;
  difficulty: Difficulty;
}

export class ProblemRepository {
  /** Uniformly sample up to `n` problems of the given difficulty. */
  async sampleByDifficulty(difficulty: Difficulty, n: number): Promise<SampledProblem[]> {
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
}
