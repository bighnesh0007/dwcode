/**
 * Learning paths (SFCode parity, Phase D): onboarding, placement, roadmaps
 * with quizzes, a weekly plan, and MCD Level 1 prep — mock exams, spaced
 * review and readiness. Every answer is graded here: the client receives
 * questions without answers and never reports its own score. A learner's
 * state is one record, read and written whole.
 */
import { randomInt } from "node:crypto";
import {
  LEARNER_GOALS,
  LEARNER_LEVELS,
  LEARNER_ROLES,
  WEEKLY_HOURS,
  dueForReview,
  nextReview,
  placementLevel,
  readiness,
  sampleMock,
  stepComplete,
  weeklyPlan,
  type LearnerLevel,
  type Onboarding,
  type ReviewState,
} from "@dwcode/shared";
import { BadRequestError, NotFoundError } from "../../errors/AppError.ts";
import type { LearnerRepository } from "../../repositories/learner.repository.ts";
import type { ProblemCatalogRepository } from "../../repositories/problemCatalog.repository.ts";
import type { SubmissionRepository } from "../../repositories/submission.repository.ts";
import type { Clock } from "../../types/ports.ts";
import {
  CERT_QUESTIONS,
  EXAM,
  PLACEMENT,
  ROADMAPS,
  publicQuestion,
  type CertQuestion,
  type PublicQuestion,
  type Question,
  type Roadmap,
} from "./content.ts";

/** Mock scores kept per learner (readiness reads the last five). */
const MOCK_HISTORY = 20;
/** Problems suggested per roadmap step. */
const STEP_PROBLEMS = 5;
/** How long the approved community questions are cached. */
const BANK_TTL_MS = 60_000;

export interface MockResult {
  at: string;
  score: number;
  bySection: Record<string, { correct: number; total: number }>;
}

export interface LearnerState {
  onboarding: Onboarding | null;
  placement: { level: LearnerLevel; correct: number; total: number; at: string } | null;
  roadmapId: string | null;
  /** `${roadmapId}/${stepId}` for every step quiz passed. */
  quizzesPassed: string[];
  review: Record<string, ReviewState>;
  mocks: MockResult[];
}

export type Answers = Record<string, number>;

export interface GradedQuestion {
  id: string;
  correct: boolean;
  chosen: number | null;
  answer: number;
  explanation: string;
}

interface CatalogEntry {
  slug: string;
  title: string;
  difficulty: string;
  category: string;
}

function emptyState(): LearnerState {
  return { onboarding: null, placement: null, roadmapId: null, quizzesPassed: [], review: {}, mocks: [] };
}

function normalise(raw: unknown): LearnerState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<LearnerState>;
  return {
    onboarding: s.onboarding ?? null,
    placement: s.placement ?? null,
    roadmapId: typeof s.roadmapId === "string" ? s.roadmapId : null,
    quizzesPassed: Array.isArray(s.quizzesPassed) ? s.quizzesPassed : [],
    review: s.review && typeof s.review === "object" ? s.review : {},
    mocks: Array.isArray(s.mocks) ? s.mocks : [],
  };
}

function grade(questions: readonly Question[], answers: Answers): GradedQuestion[] {
  return questions.map((q) => {
    const given = answers[q.id];
    const chosen = typeof given === "number" && Number.isInteger(given) ? given : null;
    return { id: q.id, correct: chosen === q.answer, chosen, answer: q.answer, explanation: q.explanation };
  });
}

/** The roadmap that suits an onboarding: interviews for that goal, else by level. */
export function recommendRoadmap(o: Pick<Onboarding, "goal" | "level">): string {
  if (o.goal === "interviews" || o.goal === "first-job") return "interviews";
  return o.level === "new" ? "beginner" : "integration";
}

export class LearningService {
  constructor(
    private readonly learners: LearnerRepository,
    private readonly catalog: ProblemCatalogRepository,
    private readonly submissions: SubmissionRepository,
    private readonly clock: Clock,
    /** Approved community questions (Phase E), added to the bank. */
    private readonly community: () => Promise<CertQuestion[]> = () => Promise.resolve([]),
  ) {}

  private bankCache: { at: number; questions: readonly CertQuestion[] } | null = null;

  /** The question bank: the shipped questions plus approved community ones. */
  private async bank(): Promise<readonly CertQuestion[]> {
    const now = this.clock.nowMs();
    if (this.bankCache && now - this.bankCache.at < BANK_TTL_MS) return this.bankCache.questions;
    let extra: CertQuestion[] = [];
    try {
      const sections = new Set(EXAM.sections.map((s) => s.id));
      extra = (await this.community()).filter((q) => sections.has(q.section));
    } catch {
      extra = []; // the shipped bank still works
    }
    const questions = [...CERT_QUESTIONS, ...extra];
    this.bankCache = { at: now, questions };
    return questions;
  }

  private async load(userId: string): Promise<LearnerState> {
    return normalise(await this.learners.get(userId));
  }

  private save(userId: string, state: LearnerState): Promise<void> {
    return this.learners.put(userId, state);
  }

  private now(): Date {
    return new Date(this.clock.nowMs());
  }

  // ── Onboarding and placement ──────────────────────────────────────────────

  async me(userId: string) {
    const s = await this.load(userId);
    return {
      onboarding: s.onboarding,
      placement: s.placement,
      roadmapId: s.roadmapId,
      needsOnboarding: s.onboarding === null,
      options: { roles: LEARNER_ROLES, levels: LEARNER_LEVELS, goals: LEARNER_GOALS, hours: WEEKLY_HOURS },
    };
  }

  async saveOnboarding(userId: string, onboarding: Onboarding, roadmapId?: string) {
    if (roadmapId && !ROADMAPS.some((r) => r.id === roadmapId)) throw new BadRequestError("Unknown roadmap.");
    const s = await this.load(userId);
    s.onboarding = onboarding;
    s.roadmapId = roadmapId ?? s.roadmapId ?? recommendRoadmap(onboarding);
    await this.save(userId, s);
    return this.me(userId);
  }

  placementQuiz(): { questions: (PublicQuestion & { tier: number })[] } {
    return { questions: PLACEMENT.map((q) => ({ ...publicQuestion(q), tier: q.tier })) };
  }

  /** Grade the placement check; signed-in learners keep the result. */
  async gradePlacement(userId: string | undefined, answers: Answers) {
    const results = grade(PLACEMENT, answers);
    const level = placementLevel(PLACEMENT.map((q, i) => ({ tier: q.tier, correct: results[i]?.correct ?? false })));
    const correct = results.filter((r) => r.correct).length;
    if (userId) {
      const s = await this.load(userId);
      s.placement = { level, correct, total: PLACEMENT.length, at: this.now().toISOString() };
      await this.save(userId, s);
    }
    return { level, correct, total: PLACEMENT.length, results };
  }

  // ── Roadmaps ──────────────────────────────────────────────────────────────

  roadmaps() {
    return ROADMAPS.map((r) => ({ id: r.id, title: r.title, summary: r.summary, steps: r.steps.length }));
  }

  private async solvedEntries(userId: string | undefined): Promise<{ catalog: CatalogEntry[]; solved: Set<string> }> {
    const rows = (await this.catalog.list({})) as unknown as Partial<CatalogEntry>[];
    const catalog = rows
      .filter((r): r is CatalogEntry => typeof r.slug === "string")
      .map((r) => ({ slug: r.slug, title: r.title ?? r.slug, difficulty: r.difficulty ?? "", category: r.category ?? "" }));
    const solved = new Set(userId ? await this.submissions.acceptedSlugs(userId) : []);
    return { catalog, solved };
  }

  private findRoadmap(id: string): Roadmap {
    const roadmap = ROADMAPS.find((r) => r.id === id);
    if (!roadmap) throw new NotFoundError("Roadmap not found.");
    return roadmap;
  }

  /** A roadmap with each step's lesson, quiz (no answers), progress and problems to practise. */
  async roadmap(id: string, userId: string | undefined) {
    const roadmap = this.findRoadmap(id);
    const [{ catalog, solved }, state] = await Promise.all([
      this.solvedEntries(userId),
      userId ? this.load(userId) : Promise.resolve(emptyState()),
    ]);
    const solvedByCategory: Record<string, number> = {};
    for (const p of catalog) {
      if (solved.has(p.slug)) solvedByCategory[p.category.toLowerCase()] = (solvedByCategory[p.category.toLowerCase()] ?? 0) + 1;
    }
    const passed = new Set(state.quizzesPassed);
    const steps = roadmap.steps.map((step) => {
      const categories = new Set(step.categories.map((c) => c.toLowerCase()));
      const inSteps = catalog.filter((p) => categories.has(p.category.toLowerCase()));
      const solvedHere = step.categories.reduce((n, c) => n + (solvedByCategory[c.toLowerCase()] ?? 0), 0);
      const quizPassed = passed.has(`${roadmap.id}/${step.id}`);
      return {
        id: step.id,
        title: step.title,
        lesson: step.lesson,
        categories: step.categories,
        solveCount: step.solveCount,
        solved: Math.min(solvedHere, step.solveCount),
        quiz: step.quiz.map(publicQuestion),
        quizPassed,
        complete: stepComplete({ categories: step.categories, solveCount: step.solveCount, hasQuiz: step.quiz.length > 0 }, solvedByCategory, quizPassed),
        problems: [...inSteps.filter((p) => !solved.has(p.slug)), ...inSteps.filter((p) => solved.has(p.slug))]
          .slice(0, STEP_PROBLEMS)
          .map((p) => ({ ...p, solved: solved.has(p.slug) })),
      };
    });
    const complete = new Set(steps.filter((s) => s.complete).map((s) => s.id));
    const hours = state.onboarding?.hours ?? "3-5";
    return {
      id: roadmap.id,
      title: roadmap.title,
      summary: roadmap.summary,
      steps,
      completed: complete.size,
      weekly: weeklyPlan(steps, complete, hours).map((s) => s.id),
      hours,
      current: state.roadmapId === roadmap.id,
    };
  }

  async gradeQuiz(userId: string, roadmapId: string, stepId: string, answers: Answers) {
    const step = this.findRoadmap(roadmapId).steps.find((s) => s.id === stepId);
    if (!step || step.quiz.length === 0) throw new NotFoundError("Quiz not found.");
    const results = grade(step.quiz, answers);
    const passed = results.every((r) => r.correct);
    if (passed) {
      const s = await this.load(userId);
      const key = `${roadmapId}/${stepId}`;
      if (!s.quizzesPassed.includes(key)) {
        s.quizzesPassed.push(key);
        await this.save(userId, s);
      }
    }
    return { passed, results };
  }

  async chooseRoadmap(userId: string, roadmapId: string) {
    this.findRoadmap(roadmapId);
    const s = await this.load(userId);
    s.roadmapId = roadmapId;
    await this.save(userId, s);
    return { roadmapId };
  }

  // ── Certification prep ────────────────────────────────────────────────────

  async exam() {
    const bank = await this.bank();
    const counts: Record<string, number> = {};
    for (const q of bank) counts[q.section] = (counts[q.section] ?? 0) + 1;
    return {
      ...EXAM,
      sections: EXAM.sections.map((s) => ({ ...s, questions: counts[s.id] ?? 0 })),
      bank: bank.length,
      community: bank.length - CERT_QUESTIONS.length,
    };
  }

  private async mockQuestions(seed: number): Promise<CertQuestion[]> {
    const bank = await this.bank();
    return sampleMock(bank, EXAM.sections, Math.min(EXAM.mockQuestions, bank.length), seed);
  }

  /** A new mock: the seed re-derives the same questions when it is graded, so nothing is stored. */
  async startMock() {
    const seed = randomInt(1, 2 ** 31 - 1);
    return {
      seed,
      minutes: EXAM.mockMinutes,
      passPercent: EXAM.passPercent,
      questions: (await this.mockQuestions(seed)).map((q) => ({ ...publicQuestion(q), section: q.section })),
    };
  }

  async gradeMock(userId: string, seed: number, answers: Answers) {
    const questions = await this.mockQuestions(seed);
    const results = grade(questions, answers);
    const now = this.now();
    const bySection: MockResult["bySection"] = {};
    const s = await this.load(userId);
    questions.forEach((q, i) => {
      const correct = results[i]?.correct ?? false;
      const cell = (bySection[q.section] ??= { correct: 0, total: 0 });
      cell.total++;
      if (correct) cell.correct++;
      this.applyReview(s, q.id, correct, now);
    });
    const score = Math.round((results.filter((r) => r.correct).length / Math.max(1, questions.length)) * 100);
    s.mocks = [...s.mocks, { at: now.toISOString(), score, bySection }].slice(-MOCK_HISTORY);
    await this.save(userId, s);
    return {
      score,
      passed: score >= EXAM.passPercent,
      bySection,
      results: results.map((r, i) => ({ ...r, section: questions[i]?.section ?? "" })),
    };
  }

  private applyReview(s: LearnerState, id: string, correct: boolean, now: Date): ReviewState | null {
    const next = nextReview(s.review[id], correct, now);
    if (next) {
      s.review[id] = next;
    } else {
      s.review = Object.fromEntries(Object.entries(s.review).filter(([qid]) => qid !== id));
    }
    return next;
  }

  /** Questions due for spaced review now, without answers. */
  async reviewQueue(userId: string) {
    const s = await this.load(userId);
    const due = new Set(dueForReview(s.review, this.now()));
    const questions = (await this.bank()).filter((q) => due.has(q.id));
    return {
      due: questions.map((q) => ({ ...publicQuestion(q), section: q.section, box: s.review[q.id]?.box ?? 0 })),
      open: Object.keys(s.review).length,
    };
  }

  async answerReview(userId: string, questionId: string, chosen: number) {
    const q = (await this.bank()).find((x) => x.id === questionId);
    if (!q) throw new NotFoundError("Question not found.");
    const s = await this.load(userId);
    if (!s.review[q.id]) throw new BadRequestError("That question is not in your review queue.");
    const correct = chosen === q.answer;
    const next = this.applyReview(s, q.id, correct, this.now());
    await this.save(userId, s);
    return { correct, answer: q.answer, explanation: q.explanation, next, graduated: next === null };
  }

  async readiness(userId: string) {
    const s = await this.load(userId);
    const sections: Record<string, { correct: number; total: number }> = {};
    for (const m of s.mocks.slice(-5)) {
      for (const [id, c] of Object.entries(m.bySection)) {
        const cell = (sections[id] ??= { correct: 0, total: 0 });
        cell.correct += c.correct;
        cell.total += c.total;
      }
    }
    const open = Object.keys(s.review).length;
    return {
      readiness: readiness(s.mocks.map((m) => m.score), open),
      passPercent: EXAM.passPercent,
      mocks: s.mocks.map((m) => ({ at: m.at, score: m.score })),
      openReview: open,
      due: dueForReview(s.review, this.now()).length,
      sections,
    };
  }
}
