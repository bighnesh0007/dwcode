/**
 * Competition rules — contest standings, rating and rating tiers (SFCode
 * parity, Phase C). Pure functions: standings are computed on read from the
 * submissions inside a contest's window, and ratings are replayed from ended
 * contests' standings, so nothing needs storing or backfilling.
 */
import { DIFFICULTY_TIERS } from "./difficulty.js";

/** Penalty minutes for each rejected attempt before a problem's first Accepted. */
export const WRONG_ATTEMPT_PENALTY_MIN = 5;

/** Points for solving a problem in a contest, from the difficulty registry. */
export function contestPointsFor(difficulty: string): number {
  const tier = DIFFICULTY_TIERS.find((t) => t.id === difficulty);
  return (tier?.scoreWeight ?? 1) * 100;
}

export interface ContestSubmission {
  userId: string;
  problemSlug: string;
  status: string;
  createdAt: Date;
}

export interface StandingRow {
  userId: string;
  rank: number;
  points: number;
  solved: number;
  /** Minutes: time to each first Accepted plus wrong-attempt penalties. */
  penalty: number;
  /** Per problem slug: solve minute (or null) and rejected attempts before it. */
  problems: Record<string, { solvedAt: number | null; wrong: number }>;
}

/**
 * ICPC-style standings. Only submissions inside [start, end] count; "Error"
 * (the compiler's or grader's) is not a wrong attempt. Ranked by points, then
 * penalty, then who reached their score first. Equal rows share a rank.
 */
export function contestStandings(
  participants: readonly string[],
  problems: readonly { slug: string; difficulty: string }[],
  subs: readonly ContestSubmission[],
  start: Date,
  end: Date,
): StandingRow[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const slugs = new Set(problems.map((p) => p.slug));
  const pointsBySlug = new Map(problems.map((p) => [p.slug, contestPointsFor(p.difficulty)]));
  const ordered = [...subs]
    .filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= startMs && t <= endMs && slugs.has(s.problemSlug) && s.status !== "Error";
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const rows = new Map<string, StandingRow & { lastSolveMs: number }>();
  for (const userId of participants) {
    rows.set(userId, { userId, rank: 0, points: 0, solved: 0, penalty: 0, problems: {}, lastSolveMs: 0 });
  }
  for (const s of ordered) {
    const row = rows.get(s.userId);
    if (!row) continue; // not a participant
    const cell = (row.problems[s.problemSlug] ??= { solvedAt: null, wrong: 0 });
    if (cell.solvedAt !== null) continue;
    const at = new Date(s.createdAt).getTime();
    if (s.status === "Accepted") {
      cell.solvedAt = Math.floor((at - startMs) / 60_000);
      row.solved++;
      row.points += pointsBySlug.get(s.problemSlug) ?? 0;
      row.penalty += cell.solvedAt + cell.wrong * WRONG_ATTEMPT_PENALTY_MIN;
      row.lastSolveMs = at;
    } else {
      cell.wrong++;
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) => b.points - a.points || a.penalty - b.penalty || a.lastSolveMs - b.lastSolveMs || a.userId.localeCompare(b.userId),
  );
  let rank = 0;
  let prev: (typeof sorted)[number] | undefined;
  sorted.forEach((row, i) => {
    if (!prev || row.points !== prev.points || row.penalty !== prev.penalty) rank = i + 1;
    row.rank = rank;
    prev = row;
  });
  return sorted.map(({ lastSolveMs: _last, ...row }) => row);
}

/** Coins paid to the top three of an ended contest (only to entrants who scored). */
export const CONTEST_PRIZES = [100, 60, 30] as const;

// ── Rating ──────────────────────────────────────────────────────────────────

export const INITIAL_RATING = 1500;
const K = 32;

export interface ContestPlacing {
  contestId: string;
  endedAt: Date;
  /** userId → rank (1 = best); equal ranks are ties. */
  ranks: ReadonlyMap<string, number>;
}

export interface RatingPoint {
  contestId: string;
  rating: number;
  delta: number;
  rank: number;
}

/**
 * Multiplayer Elo, replayed over contests oldest first. Every pair of entrants
 * is compared (better rank wins, equal is half), and each player moves by
 * K × (actual − expected), averaged over opponents, so one contest moves a
 * rating by at most ±K. Contests with fewer than two entrants do not count.
 */
export function replayRatings(contests: readonly ContestPlacing[]): Map<string, RatingPoint[]> {
  const rating = new Map<string, number>();
  const history = new Map<string, RatingPoint[]>();
  const ordered = [...contests].sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
  for (const c of ordered) {
    const players = [...c.ranks.entries()];
    if (players.length < 2) continue;
    const before = new Map(players.map(([u]) => [u, rating.get(u) ?? INITIAL_RATING]));
    for (const [u, rank] of players) {
      const r = before.get(u) ?? INITIAL_RATING;
      let total = 0;
      for (const [v, vRank] of players) {
        if (v === u) continue;
        const expected = 1 / (1 + 10 ** (((before.get(v) ?? INITIAL_RATING) - r) / 400));
        const actual = rank < vRank ? 1 : rank === vRank ? 0.5 : 0;
        total += actual - expected;
      }
      const delta = Math.round((K * total) / (players.length - 1));
      rating.set(u, r + delta);
      const list = history.get(u) ?? [];
      list.push({ contestId: c.contestId, rating: r + delta, delta, rank });
      history.set(u, list);
    }
  }
  return history;
}

export interface RatingTier {
  id: string;
  label: string;
  min: number;
}

/** Highest first. */
export const RATING_TIERS: readonly RatingTier[] = [
  { id: "grandmaster", label: "Grandmaster", min: 2200 },
  { id: "master", label: "Master", min: 1900 },
  { id: "expert", label: "Expert", min: 1650 },
  { id: "specialist", label: "Specialist", min: 1500 },
  { id: "apprentice", label: "Apprentice", min: 1350 },
  { id: "newcomer", label: "Newcomer", min: 0 },
];

export function ratingTierFor(rating: number): RatingTier {
  return RATING_TIERS.find((t) => rating >= t.min) ?? (RATING_TIERS[RATING_TIERS.length - 1] as RatingTier);
}

// ── Teams and countries ─────────────────────────────────────────────────────

export const TEAM_LIMITS = { maxMembers: 20, nameMin: 3, nameMax: 40 } as const;

/** A URL-safe slug from a team name. */
export function teamSlugFor(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

/** ISO 3166-1 alpha-2 codes a profile can choose, with display names. */
export const COUNTRIES: readonly { code: string; name: string }[] = [
  { code: "AR", name: "Argentina" }, { code: "AU", name: "Australia" }, { code: "AT", name: "Austria" },
  { code: "BD", name: "Bangladesh" }, { code: "BE", name: "Belgium" }, { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" }, { code: "CL", name: "Chile" }, { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" }, { code: "CZ", name: "Czechia" }, { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" }, { code: "FI", name: "Finland" }, { code: "FR", name: "France" },
  { code: "DE", name: "Germany" }, { code: "GR", name: "Greece" }, { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" }, { code: "IN", name: "India" }, { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" }, { code: "IL", name: "Israel" }, { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" }, { code: "KE", name: "Kenya" }, { code: "KR", name: "South Korea" },
  { code: "MY", name: "Malaysia" }, { code: "MX", name: "Mexico" }, { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" }, { code: "NG", name: "Nigeria" }, { code: "NO", name: "Norway" },
  { code: "PK", name: "Pakistan" }, { code: "PE", name: "Peru" }, { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" }, { code: "PT", name: "Portugal" }, { code: "RO", name: "Romania" },
  { code: "SA", name: "Saudi Arabia" }, { code: "SG", name: "Singapore" }, { code: "ZA", name: "South Africa" },
  { code: "ES", name: "Spain" }, { code: "LK", name: "Sri Lanka" }, { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" }, { code: "TW", name: "Taiwan" }, { code: "TH", name: "Thailand" },
  { code: "TR", name: "Türkiye" }, { code: "UA", name: "Ukraine" }, { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" }, { code: "VN", name: "Vietnam" },
];

export function isCountryCode(code: string): boolean {
  return COUNTRIES.some((c) => c.code === code);
}
