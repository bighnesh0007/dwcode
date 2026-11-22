/** Reads and claims behind contest standings, ratings and payouts. Delegates to data/repositories. */
import * as contests from "../data/repositories/contests.ts";
import * as problems from "../data/repositories/problems.ts";
import * as settings from "../data/repositories/settings.ts";
import * as submissions from "../data/repositories/submissions.ts";

export interface ContestSnapshot {
  id: string;
  title: string;
  isPublic: boolean;
  createdBy: string;
  startTime: Date;
  endTime: Date;
  problems: { slug: string; title: string; difficulty: string }[];
  participants: { userId: string; userName: string; userImageUrl: string }[];
}

type Raw = Record<string, unknown>;

/** A stored scalar as text; anything else (missing, an object) reads as "". */
const text = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function snapshot(c: Raw): ContestSnapshot {
  const problemsOf = (c.problems as Raw[] | undefined) ?? [];
  const participantsOf = (c.participants as Raw[] | undefined) ?? [];
  return {
    id: String(c._id),
    title: text(c.title),
    isPublic: c.isPublic !== false,
    createdBy: text(c.createdBy),
    startTime: new Date(c.startTime as Date),
    endTime: new Date(c.endTime as Date),
    problems: problemsOf
      .filter((p) => typeof p === "object" && typeof p.slug === "string")
      .map((p) => ({ slug: String(p.slug), title: text(p.title) || String(p.slug), difficulty: text(p.difficulty) })),
    participants: participantsOf.map((p) => ({
      userId: text(p.userId),
      userName: text(p.userName),
      userImageUrl: text(p.userImageUrl),
    })),
  };
}

export class CompetitionRepository {
  async contest(id: string): Promise<ContestSnapshot | null> {
    if (!problems.isValidId(id)) return null;
    const c = await contests.findWithProblems(id);
    return c ? snapshot(c) : null;
  }

  /** Public contests with problems attached, newest first. */
  async publicContests(): Promise<ContestSnapshot[]> {
    const rows = (await contests.listVisible(null)) as Raw[];
    return rows.map(snapshot);
  }

  submissionsInWindow(problemSlugs: string[], start: Date, end: Date) {
    return submissions.inWindowForProblems(problemSlugs, start, end, 50_000);
  }

  /** True only for the first caller: makes a reminder or payout happen once. */
  claim(key: string): Promise<boolean> {
    return settings.claim(key, { at: new Date().toISOString() }, "system");
  }
}
