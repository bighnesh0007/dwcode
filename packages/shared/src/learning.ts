/**
 * Learning-path rules — onboarding, placement, weekly plans, spaced review,
 * mock exams and readiness (SFCode parity, Phase D). Pure functions; the
 * content (roadmaps, quizzes, certification questions) lives in the server's
 * content/ folder so answers never ship to the browser.
 */

export const LEARNER_ROLES = ["student", "developer", "integration-engineer", "architect", "other"] as const;
export const LEARNER_LEVELS = ["new", "basics", "production", "expert"] as const;
export const LEARNER_GOALS = ["learn-dataweave", "first-job", "certification", "interviews", "level-up"] as const;
export const WEEKLY_HOURS = ["1-2", "3-5", "6+"] as const;

export type LearnerRole = (typeof LEARNER_ROLES)[number];
export type LearnerLevel = (typeof LEARNER_LEVELS)[number];
export type LearnerGoal = (typeof LEARNER_GOALS)[number];
export type WeeklyHours = (typeof WEEKLY_HOURS)[number];

export interface Onboarding {
  role: LearnerRole;
  level: LearnerLevel;
  goal: LearnerGoal;
  hours: WeeklyHours;
}

// ── Placement ───────────────────────────────────────────────────────────────

export type PlacementTier = 1 | 2 | 3;

/**
 * The level a placement check suggests: the highest tier the learner mostly
 * got right (at least two thirds), counting a tier only if every tier below
 * it was passed too.
 */
export function placementLevel(results: readonly { tier: PlacementTier; correct: boolean }[]): LearnerLevel {
  const passed = (tier: PlacementTier) => {
    const inTier = results.filter((r) => r.tier === tier);
    return inTier.length > 0 && inTier.filter((r) => r.correct).length / inTier.length >= 2 / 3;
  };
  if (!passed(1)) return "new";
  if (!passed(2)) return "basics";
  if (!passed(3)) return "production";
  return "expert";
}

// ── Roadmaps ────────────────────────────────────────────────────────────────

/** A roadmap step is complete once its problem target is met and its quiz (if any) is passed. */
export interface StepRequirement {
  /** Solve this many problems in any of these categories. */
  categories: readonly string[];
  solveCount: number;
  hasQuiz: boolean;
}

export function stepComplete(
  req: StepRequirement,
  solvedByCategory: Readonly<Record<string, number>>,
  quizPassed: boolean,
): boolean {
  const solved = req.categories.reduce((n, c) => n + (solvedByCategory[c.toLowerCase()] ?? 0), 0);
  return solved >= req.solveCount && (!req.hasQuiz || quizPassed);
}

/** Steps a week of practice covers, by the hours a learner chose. */
export const STEPS_PER_WEEK: Record<WeeklyHours, number> = { "1-2": 1, "3-5": 2, "6+": 3 };

/** This week's plan: the next incomplete steps, in roadmap order. */
export function weeklyPlan<T extends { id: string }>(steps: readonly T[], complete: ReadonlySet<string>, hours: WeeklyHours): T[] {
  return steps.filter((s) => !complete.has(s.id)).slice(0, STEPS_PER_WEEK[hours]);
}

// ── Spaced review (Leitner boxes) ───────────────────────────────────────────

/** Days to wait before a question in each box is due again. */
export const REVIEW_INTERVAL_DAYS = [0, 1, 3, 7, 14] as const;
/** Correct answers in a row that take a question out of review. */
export const REVIEW_GRADUATE = REVIEW_INTERVAL_DAYS.length;

export interface ReviewState {
  box: number;
  /** ISO time the question is next due. */
  due: string;
}

/**
 * The next review state after an answer. A miss puts the question in box 0,
 * due now; a correct answer moves it up a box. Returns null when it graduates
 * (or when a question never in review is answered correctly).
 */
export function nextReview(current: ReviewState | undefined, correct: boolean, now: Date): ReviewState | null {
  if (!correct) return { box: 0, due: now.toISOString() };
  if (!current) return null;
  const box = current.box + 1;
  if (box >= REVIEW_GRADUATE) return null;
  const days = REVIEW_INTERVAL_DAYS[box] ?? 0;
  return { box, due: new Date(now.getTime() + days * 86_400_000).toISOString() };
}

export function dueForReview(review: Readonly<Record<string, ReviewState>>, now: Date): string[] {
  return Object.entries(review)
    .filter(([, s]) => Date.parse(s.due) <= now.getTime())
    .sort(([, a], [, b]) => Date.parse(a.due) - Date.parse(b.due))
    .map(([id]) => id);
}

// ── Mock exams ──────────────────────────────────────────────────────────────

export interface ExamSection {
  id: string;
  title: string;
  /** Share of the exam, in percent. */
  weight: number;
}

/** A small deterministic PRNG (mulberry32), so a mock can be re-derived from its seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick `count` questions weighted by section, without repeats. A section gets
 * round(weight × count) questions (largest remainders first), capped by what
 * its bank holds; any shortfall is filled from the other sections.
 */
export function sampleMock<Q extends { id: string; section: string }>(
  questions: readonly Q[],
  sections: readonly ExamSection[],
  count: number,
  seed: number,
): Q[] {
  const rand = seededRandom(seed);
  const shuffle = <T>(xs: T[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
    }
    return xs;
  };
  const totalWeight = sections.reduce((n, s) => n + s.weight, 0) || 1;
  const quotas = sections.map((s) => {
    const exact = (s.weight / totalWeight) * count;
    return { id: s.id, n: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = count - quotas.reduce((n, q) => n + q.n, 0);
  for (const q of [...quotas].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    q.n++;
    left--;
  }
  const picked: Q[] = [];
  const spare: Q[] = [];
  for (const q of quotas) {
    const bank = shuffle(questions.filter((x) => x.section === q.id));
    picked.push(...bank.slice(0, q.n));
    spare.push(...bank.slice(q.n));
  }
  picked.push(...shuffle(spare).slice(0, Math.max(0, count - picked.length)));
  return picked.slice(0, count);
}

/** Readiness 0–100: recent mock scores, weighted toward the latest, minus a penalty for open review items. */
export function readiness(mockScores: readonly number[], openReviewItems: number): number {
  if (mockScores.length === 0) return 0;
  const recent = mockScores.slice(-5);
  let total = 0;
  let weights = 0;
  recent.forEach((score, i) => {
    const w = i + 1;
    total += score * w;
    weights += w;
  });
  return Math.max(0, Math.min(100, Math.round(total / weights - Math.min(20, openReviewItems * 2))));
}
