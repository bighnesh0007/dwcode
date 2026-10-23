/**
 * AI problem generation, ported from /api/generate (admin, platform key) and
 * /api/generate-public (any signed-in user, their own key).
 *
 * Changes from the Next routes, deliberately:
 *   - a missing platform key is 503 NOT_CONFIGURED (was a 400)
 *   - model output is validated and mapped field by field before it is saved
 *     (SEC-15); the routes spread it into the model constructor
 *   - topic is sanitised on both routes (the public one passed it raw)
 */
import { DEFAULT_DIFFICULTY } from "@dwcode/shared";
import { NotConfiguredError, UpstreamError } from "../../errors/AppError.ts";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { NewProblem } from "../../repositories/problemCatalog.repository.ts";
import { generatedProblemSchema, type GeneratedProblem } from "../../validation/problem.schema.ts";
import { PROBLEM_CREATED_COINS, slugify, type ProblemService } from "./problem.service.ts";
import type { ProblemGenerator } from "./problemGenerator.ts";

const DEFAULT_CATEGORY = "Arrays";

export interface GenerateRequest {
  difficulty?: string | undefined;
  category?: string | undefined;
  topic?: string | undefined;
}

/** `topic` lands inside the prompt (finding M-2): cap it and strip block-closing characters. */
export function sanitizeTopic(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/[`{}<>\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function buildPrompt(difficulty: string, category: string, topic: string): string {
  return `Create a DataWeave coding problem for a platform similar to LeetCode.
Difficulty: ${difficulty}
Category: ${category}
${topic ? `Specific Topic: ${topic}` : ""}

Return ONLY a valid JSON object matching this schema. Do not wrap in markdown tags like \`\`\`json:
{
  "title": "string (Short descriptive title)",
  "description": "string (Detailed problem description)",
  "tags": ["string"],
  "examples": [{ "input": "string (JSON string representation)", "output": "string (JSON string representation)", "explanation": "string (optional)" }],
  "constraints": ["string"],
  "starterCode": "string (DataWeave 2.0 template starting with %dw 2.0)",
  "testCases": [{ "input": "string", "expectedOutput": "string" }],
  "hiddenTestCases": [{ "input": "string", "expectedOutput": "string" }],
  "solution": "string (The complete DataWeave solution)",
  "hints": ["string"]
}

Questions should test real DataWeave skills. Avoid trivial questions. Include MuleSoft integration scenarios where possible.`;
}

export function parseModelOutput(text: string): GeneratedProblem {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new UpstreamError("Failed to parse the model's response as JSON. Try again.");
  }
  const parsed = generatedProblemSchema.safeParse(raw);
  if (!parsed.success) throw new UpstreamError("Model returned an unusable problem. Try again.");
  if (!slugify(parsed.data.title)) throw new UpstreamError("Model returned no usable title. Try again.");
  return parsed.data;
}

export class ProblemGenerationService {
  constructor(
    private readonly generator: ProblemGenerator,
    private readonly problems: ProblemService,
    private readonly coins: CoinsRepository,
    private readonly platformApiKey: string | undefined,
  ) {}

  /** Admin: the platform's key, no coins (as before). */
  async generateAsAdmin(req: GenerateRequest) {
    if (!this.platformApiKey) throw new NotConfiguredError("AI problem generation");
    return this.run(req, this.platformApiKey, "");
  }

  /** Any signed-in user with their own key; pays the creation coins. */
  async generateWithOwnKey(req: GenerateRequest, apiKey: string, userId: string) {
    const problem = await this.run(req, apiKey, userId);
    await this.coins.award(userId, PROBLEM_CREATED_COINS, "problem_created", `Created problem: ${problem.title}`);
    return problem;
  }

  private async run(req: GenerateRequest, apiKey: string, createdBy: string) {
    const difficulty = req.difficulty ?? DEFAULT_DIFFICULTY;
    const category = req.category?.trim() || DEFAULT_CATEGORY;
    const prompt = buildPrompt(difficulty, category, sanitizeTopic(req.topic));

    let text: string;
    try {
      text = await this.generator.generate(prompt, apiKey);
    } catch (error) {
      // The upstream message can contain key details; do not echo it.
      throw new UpstreamError("The AI provider rejected the request. Check the API key is valid.", { cause: error });
    }
    if (!text) throw new UpstreamError("The model returned no text. Try again.");

    const g = parseModelOutput(text);
    const data: NewProblem = {
      title: g.title,
      slug: slugify(g.title),
      difficulty,
      category,
      description: g.description,
      tags: g.tags,
      examples: g.examples.map((e) => ({
        input: e.input,
        output: e.output,
        ...(e.explanation === undefined ? {} : { explanation: e.explanation }),
      })),
      constraints: g.constraints,
      ...(g.starterCode === undefined ? {} : { starterCode: g.starterCode }),
      testCases: g.testCases.map((t) => ({ input: t.input, expectedOutput: t.expectedOutput })),
      hiddenTestCases: g.hiddenTestCases.map((t) => ({ input: t.input, expectedOutput: t.expectedOutput })),
      ...(g.solution === undefined ? {} : { solution: g.solution }),
      hints: g.hints,
      createdByAI: true,
      createdBy,
    };
    return this.problems.insert(data);
  }
}
