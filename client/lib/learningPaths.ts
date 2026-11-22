/** Client types for learning paths and certification prep (Phase D). Answers are graded on the server. */
export interface PublicQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface GradedQuestion {
  id: string;
  correct: boolean;
  chosen: number | null;
  answer: number;
  explanation: string;
}

export type Answers = Record<string, number>;

export interface LearnerMe {
  onboarding: { role: string; level: string; goal: string; hours: string } | null;
  placement: { level: string; correct: number; total: number; at: string } | null;
  roadmapId: string | null;
  needsOnboarding: boolean;
  options: { roles: string[]; levels: string[]; goals: string[]; hours: string[] };
}

/** Labels for the onboarding choices; the values come from @dwcode/shared via the API. */
export const CHOICE_LABELS: Record<string, string> = {
  student: "Student",
  developer: "Developer",
  "integration-engineer": "Integration engineer",
  architect: "Architect",
  other: "Something else",
  new: "New to DataWeave",
  basics: "I know the basics",
  production: "I use it at work",
  expert: "I'm an expert",
  "learn-dataweave": "Learn DataWeave",
  "first-job": "Land my first integration job",
  certification: "Pass the MuleSoft certification",
  interviews: "Prepare for interviews",
  "level-up": "Level up at work",
  "1-2": "1–2 hours a week",
  "3-5": "3–5 hours a week",
  "6+": "6+ hours a week",
};

export const label = (value: string) => CHOICE_LABELS[value] ?? value;
