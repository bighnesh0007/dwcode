/**
 * Learning content (SFCode parity, Phase D): placement quiz, roadmaps and the
 * MCD Level 1 question bank, kept as JSON in src/content/ so contributors can
 * add to them by PR. Answers stay on the server: `publicQuestion` strips them
 * before anything is sent. `npm run check:learning -- --run` verifies every
 * code answer on the compiler.
 */
import type { ExamSection, PlacementTier } from "@dwcode/shared";
import cert from "../../content/certification-mcd-level-1.json" with { type: "json" };
import placement from "../../content/placement.json" with { type: "json" };
import roadmapFile from "../../content/roadmaps.json" with { type: "json" };

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface PlacementQuestion extends Question {
  tier: PlacementTier;
}

export interface CertQuestion extends Question {
  section: string;
}

export interface RoadmapStep {
  id: string;
  title: string;
  lesson: string;
  categories: string[];
  solveCount: number;
  quiz: Question[];
}

export interface Roadmap {
  id: string;
  title: string;
  summary: string;
  /** Learner levels this roadmap suits, for the onboarding recommendation. */
  audience: string[];
  steps: RoadmapStep[];
}

export interface Exam {
  id: string;
  title: string;
  passPercent: number;
  mockQuestions: number;
  mockMinutes: number;
  note: string;
  sections: ExamSection[];
}

export type PublicQuestion = Omit<Question, "answer" | "explanation">;

export function publicQuestion(q: Question): PublicQuestion {
  return { id: q.id, prompt: q.prompt, options: q.options };
}

export const PLACEMENT: readonly PlacementQuestion[] = placement.questions as PlacementQuestion[];
export const ROADMAPS: readonly Roadmap[] = roadmapFile.roadmaps;
export const EXAM: Exam = cert.exam;
export const CERT_QUESTIONS: readonly CertQuestion[] = cert.questions;
