/**
 * Practice-mode rules — code size and interview scoring (SFCode parity,
 * Phase B). Pure functions shared by the server (which ranks and scores) and
 * the client (which shows a live size and the scorecard).
 */

/**
 * Size of a DataWeave script: characters left once comments and whitespace
 * are removed, so formatting and explanations never count against anyone.
 * String literals are kept intact, so `"//"` inside a string is not a comment.
 */
export function codeSize(script: string): number {
  let size = 0;
  let i = 0;
  const n = script.length;
  while (i < n) {
    const c = script[i] as string;
    const next = script[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && script[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(script[i] === "*" && script[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      size++;
      i++;
      while (i < n && script[i] !== quote) {
        if (script[i] === "\\") {
          size++;
          i++;
        }
        if (i < n) {
          size++;
          i++;
        }
      }
      if (i < n) {
        size++;
        i++;
      }
      continue;
    }
    if (!/\s/.test(c)) size++;
    i++;
  }
  return size;
}

export interface SizeEntry {
  userId: string;
  size: number;
}

/** Smallest Accepted solution per user, ranked ascending (ties keep the earlier solve). */
export function rankBySize(accepted: readonly { userId: string; code: string; createdAt: Date }[]): SizeEntry[] {
  const best = new Map<string, { size: number; at: number }>();
  for (const s of accepted) {
    const size = codeSize(s.code);
    const at = new Date(s.createdAt).getTime();
    const prev = best.get(s.userId);
    if (!prev || size < prev.size || (size === prev.size && at < prev.at)) best.set(s.userId, { size, at });
  }
  return [...best.entries()]
    .sort(([, a], [, b]) => a.size - b.size || a.at - b.at)
    .map(([userId, { size }]) => ({ userId, size }));
}

// ── Interview mode ──────────────────────────────────────────────────────────

/** Interview lengths offered, in minutes, and problems per interview. */
export const INTERVIEW_PRESETS = [
  { id: "quick", label: "Quick screen", minutes: 30, problems: 2 },
  { id: "standard", label: "Technical screen", minutes: 60, problems: 3 },
  { id: "onsite", label: "Onsite loop", minutes: 90, problems: 4 },
] as const;

export type InterviewPresetId = (typeof INTERVIEW_PRESETS)[number]["id"];

export function findInterviewPreset(id: string) {
  return INTERVIEW_PRESETS.find((p) => p.id === id);
}

export interface InterviewSubmission {
  status: string;
  createdAt: Date;
}

export type ProblemOutcomeStatus = "solved" | "attempted" | "untouched";

export interface ProblemOutcome {
  status: ProblemOutcomeStatus;
  /** Submissions made inside the window. */
  attempts: number;
  /** Minutes from the start to the first Accepted, when solved. */
  solvedAfterMinutes: number | null;
}

/**
 * How one problem went: only submissions inside [startedAt, endsAt] count.
 * "Error" is the compiler's or the grader's, not a wrong answer, so it does
 * not count as an attempt.
 */
export function interviewOutcome(subs: readonly InterviewSubmission[], startedAt: Date, endsAt: Date): ProblemOutcome {
  const inWindow = subs
    .filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= startedAt.getTime() && t <= endsAt.getTime() && s.status !== "Error";
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const first = inWindow.find((s) => s.status === "Accepted");
  return {
    status: first ? "solved" : inWindow.length ? "attempted" : "untouched",
    attempts: inWindow.length,
    solvedAfterMinutes: first ? Math.round((new Date(first.createdAt).getTime() - startedAt.getTime()) / 60_000) : null,
  };
}

/** A one-line verdict for the scorecard. */
export function interviewVerdict(solved: number, total: number): string {
  if (total === 0) return "No problems in this interview.";
  const ratio = solved / total;
  if (ratio === 1) return "Strong hire — every problem solved.";
  if (ratio >= 0.66) return "Hire — solid, with room to speed up.";
  if (ratio >= 0.34) return "Lean hire — practise the topics you missed.";
  if (solved > 0) return "Not yet — one solved; keep drilling the fundamentals.";
  return "Not yet — review the solutions and try another round.";
}
