/**
 * Problem-bank rules, ported from the Next.js /api/problems routes:
 *
 *   - hidden test cases and the solution are never sent to a non-admin
 *   - provenance (createdBy, createdByAI, createdAt) and the slug are
 *     server-owned; the slug is always derived from the title
 *   - creating a problem pays the creator 2 coins
 */
import { BadRequestError, ConflictError, NotFoundError } from "../../errors/AppError.ts";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { ProblemAccessRepository } from "../../repositories/problemAccess.repository.ts";
import {
  isDuplicateKeyError,
  type NewProblem,
  type ProblemCatalogRepository,
  type ProblemPatch,
} from "../../repositories/problemCatalog.repository.ts";
import type { CreateProblemInput, UpdateProblemInput } from "../../validation/problem.schema.ts";

export const PROBLEM_CREATED_COINS = 2;

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

export class ProblemService {
  constructor(
    private readonly problems: ProblemCatalogRepository,
    private readonly access: ProblemAccessRepository,
    private readonly coins: CoinsRepository,
  ) {}

  list(filter: { difficulty?: string; category?: string }) {
    return this.problems.list(filter);
  }

  listMine(userId: string, limit: number) {
    return this.problems.listByCreator(userId, limit);
  }

  summaries(keys: { ids?: string[]; slugs?: string[] }, limit = 1000) {
    return this.problems.summaries(keys, limit);
  }

  stats() {
    return this.problems.stats();
  }

  async get(key: string, viewerId: string | undefined) {
    const includeSecrets = await this.access.isAdmin(viewerId);
    const problem = await this.problems.findByKey(key, { includeSecrets });
    if (!problem) throw new NotFoundError("Problem not found.");
    // The page needs to know whether a "Show solution" button makes sense
    // without carrying the solution itself.
    const full = includeSecrets ? problem : await this.problems.findByKey(key, { includeSecrets: true });
    return { ...problem, hasSolution: Boolean(full?.solution?.trim()) };
  }

  /**
   * The official solution, on its own — fetched only when a user chooses to
   * reveal it (which forfeits submission credit, enforced in the page). Kept
   * out of the problem payload so it is never in the page source by default.
   * Never returns hidden test cases.
   */
  async solution(key: string) {
    const problem = await this.problems.findByKey(key, { includeSecrets: true });
    if (!problem) throw new NotFoundError("Problem not found.");
    if (!problem.solution?.trim()) throw new NotFoundError("This problem has no published solution.");
    return { solution: problem.solution };
  }

  async create(input: CreateProblemInput, userId: string) {
    const slug = requireSlug(input.title);
    // Explicit mapping: nothing reaches the model that is not named here.
    const data: NewProblem = {
      title: input.title,
      slug,
      difficulty: input.difficulty,
      category: input.category,
      description: input.description,
      createdByAI: false,
      createdBy: userId,
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.examples ? { examples: input.examples } : {}),
      ...(input.constraints ? { constraints: input.constraints } : {}),
      ...(input.starterCode !== undefined ? { starterCode: input.starterCode } : {}),
      ...(input.testCases ? { testCases: input.testCases } : {}),
      ...(input.hiddenTestCases ? { hiddenTestCases: input.hiddenTestCases } : {}),
      ...(input.solution !== undefined ? { solution: input.solution } : {}),
      ...(input.hints ? { hints: input.hints } : {}),
    };
    const problem = await this.insert(data);
    await this.coins.award(userId, PROBLEM_CREATED_COINS, "problem_created", `Created problem: ${problem.title}`);
    return problem;
  }

  /** Shared by manual creation and AI generation. */
  async insert(data: NewProblem) {
    try {
      return await this.problems.create(data);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictError("A problem with that title already exists.");
      throw error;
    }
  }

  async update(id: string, input: UpdateProblemInput) {
    const patch: ProblemPatch = {};
    if (input.title !== undefined) {
      patch.title = input.title;
      patch.slug = requireSlug(input.title);
    }
    if (input.difficulty !== undefined) patch.difficulty = input.difficulty;
    if (input.category !== undefined) patch.category = input.category;
    if (input.description !== undefined) patch.description = input.description;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.examples !== undefined) patch.examples = input.examples;
    if (input.constraints !== undefined) patch.constraints = input.constraints;
    if (input.starterCode !== undefined) patch.starterCode = input.starterCode;
    if (input.testCases !== undefined) patch.testCases = input.testCases;
    if (input.hiddenTestCases !== undefined) patch.hiddenTestCases = input.hiddenTestCases;
    if (input.solution !== undefined) patch.solution = input.solution;
    if (input.hints !== undefined) patch.hints = input.hints;

    let updated;
    try {
      updated = await this.problems.update(id, patch);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictError("A problem with that title already exists.");
      throw error;
    }
    if (!updated) throw new NotFoundError("Problem not found.");
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.problems.delete(id))) throw new NotFoundError("Problem not found.");
  }
}

function requireSlug(title: string): string {
  const slug = slugify(title);
  if (!slug) throw new BadRequestError("Title must contain at least one alphanumeric character.");
  return slug;
}
