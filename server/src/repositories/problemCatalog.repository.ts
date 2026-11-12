/**
 * Problem-bank CRUD for the /problems API. Mongoose queries only — the secrecy
 * and authorisation rules live in ProblemService.
 *
 * Separate from problem.repository.ts (grading/contest reads) so the two
 * callers' projections cannot be confused.
 */
import mongoose from "mongoose";
import { DIFFICULTIES } from "@dwcode/shared";
import { Problem } from "../models/Problem.ts";

/** Everything except the fields only an admin may see. */
const PUBLIC_DETAIL = "-hiddenTestCases -solution";
/** The listing never carried test cases either. */
const SUMMARY = "-testCases -hiddenTestCases -solution";

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

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export class ProblemCatalogRepository {
  async list(filter: { difficulty?: string; category?: string }) {
    const query: Record<string, string> = {};
    if (filter.difficulty) query.difficulty = filter.difficulty;
    if (filter.category) query.category = filter.category;
    return Problem.find(query).select(SUMMARY).sort({ createdAt: -1 }).lean();
  }

  async listByCreator(userId: string, limit: number) {
    return Problem.find({ createdBy: userId }).select(SUMMARY).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async summaries(keys: { ids?: string[]; slugs?: string[] }, limit: number) {
    const or: Record<string, unknown>[] = [];
    if (keys.ids?.length) or.push({ _id: { $in: keys.ids } });
    if (keys.slugs?.length) or.push({ slug: { $in: keys.slugs } });
    if (or.length === 0) return [];
    return Problem.find({ $or: or }).select(SUMMARY).limit(limit).lean();
  }

  /** `{ total, byDifficulty }` for every tier in the shared registry. */
  async stats(): Promise<{ total: number; byDifficulty: Record<string, number> }> {
    const [total, grouped] = await Promise.all([
      Problem.countDocuments(),
      Problem.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$difficulty", n: { $sum: 1 } } }]),
    ]);
    const byDifficulty: Record<string, number> = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0]));
    for (const row of grouped) if (row._id in byDifficulty) byDifficulty[row._id] = row.n;
    return { total, byDifficulty };
  }

  /** By ObjectId when the key is one, else by slug — as the Next route did. */
  async findByKey(key: string, opts: { includeSecrets: boolean }) {
    const query = mongoose.Types.ObjectId.isValid(key) ? { _id: key } : { slug: key };
    const q = Problem.findOne(query);
    if (!opts.includeSecrets) q.select(PUBLIC_DETAIL);
    return q.lean();
  }

  async findSlugById(id: string): Promise<string | null> {
    const p = await Problem.findById(id).select("slug").lean();
    return p?.slug ?? null;
  }

  async create(data: NewProblem) {
    const doc = await Problem.create(data);
    return doc.toObject();
  }

  async update(id: string, patch: ProblemPatch) {
    return Problem.findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after", runValidators: true }).lean();
  }

  async delete(id: string): Promise<boolean> {
    return (await Problem.findByIdAndDelete(id)) !== null;
  }
}
