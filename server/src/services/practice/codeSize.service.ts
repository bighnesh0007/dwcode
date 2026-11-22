/**
 * Code-size ranking for one problem: each solver's smallest Accepted solution,
 * comments and whitespace excluded. The one efficiency measure that compares
 * fairly: run time depends on the compiler's load, not the solution.
 */
import { codeSize, rankBySize } from "@dwcode/shared";
import type { PracticeRepository } from "../../repositories/practice.repository.ts";

const SCAN_LIMIT = 5000;
const TOP = 10;

export interface SizeRanking {
  top: { rank: number; username: string; size: number }[];
  solvers: number;
  /** Signed-in solvers only. */
  mine?: { rank: number; size: number; percentile: number } | null;
}

export class CodeSizeService {
  constructor(private readonly practice: PracticeRepository) {}

  async ranking(problemSlug: string, userId: string | undefined): Promise<SizeRanking> {
    const ranked = rankBySize(await this.practice.acceptedForProblem(problemSlug, SCAN_LIMIT));
    const top = ranked.slice(0, TOP);
    const names = await this.practice.usernames(top.map((r) => r.userId));
    const view: SizeRanking = {
      solvers: ranked.length,
      top: top.map((r, i) => ({ rank: i + 1, username: names.get(r.userId) ?? "anonymous", size: r.size })),
    };
    if (userId) {
      const index = ranked.findIndex((r) => r.userId === userId);
      const entry = ranked[index];
      view.mine = entry
        ? { rank: index + 1, size: entry.size, percentile: Math.round(((ranked.length - index - 1) / Math.max(1, ranked.length - 1)) * 100) }
        : null;
    }
    return view;
  }

  /** Size of a script, for the editor's live counter. */
  measure(code: string): { size: number } {
    return { size: codeSize(code) };
  }
}
