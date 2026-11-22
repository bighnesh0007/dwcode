/**
 * Interview mode (SFCode parity, Phase B): a random, timed set of problems,
 * scored from the learner's real submissions inside the window — the client
 * never reports what it solved. The session lives in the key-value store and
 * expires a day after the interview ends.
 */
import { randomInt, randomUUID } from "node:crypto";
import {
  DIFFICULTY_TIERS,
  findInterviewPreset,
  interviewOutcome,
  interviewVerdict,
  type ProblemOutcome,
} from "@dwcode/shared";
import { BadRequestError, NotFoundError } from "../../errors/AppError.ts";
import type { ProblemCatalogRepository } from "../../repositories/problemCatalog.repository.ts";
import type { SubmissionRepository } from "../../repositories/submission.repository.ts";
import type { Clock, KeyValueStore } from "../../types/ports.ts";

const KEEP_AFTER_END_MS = 24 * 60 * 60_000;
const HISTORY_LIMIT = 500;

interface ProblemRef {
  slug: string;
  title: string;
  difficulty: string;
  category: string;
}

interface Session {
  id: string;
  preset: string;
  problems: ProblemRef[];
  startedAt: string;
  endsAt: string;
  finishedAt: string | null;
}

export interface InterviewView extends Session {
  outcomes: Record<string, ProblemOutcome>;
  solved: number;
  /** Set once the interview has ended or been finished. */
  verdict: string | null;
}

const key = (userId: string) => `interview:${userId}`;
const TIER_ORDER = new Map(DIFFICULTY_TIERS.map((t, i) => [t.id, i]));

export class InterviewService {
  constructor(
    private readonly store: KeyValueStore,
    private readonly catalog: ProblemCatalogRepository,
    private readonly submissions: SubmissionRepository,
    private readonly clock: Clock,
  ) {}

  async start(userId: string, presetId: string): Promise<InterviewView> {
    const preset = findInterviewPreset(presetId);
    if (!preset) throw new BadRequestError("Unknown interview type.");
    const current = await this.store.get<Session>(key(userId));
    if (current && !current.finishedAt && Date.parse(current.endsAt) > this.clock.nowMs()) {
      throw new BadRequestError("You already have an interview in progress. Finish it first.");
    }

    const rows = (await this.catalog.list({})) as unknown as Partial<ProblemRef>[];
    const pool = rows.filter((r): r is ProblemRef => typeof r.slug === "string" && r.category !== "Debugging");
    if (pool.length < preset.problems) throw new BadRequestError("Not enough problems for an interview yet.");
    const solved = new Set(await this.submissions.acceptedSlugs(userId));
    // Unsolved problems first, so an interview tests something new when it can.
    const fresh = pool.filter((p) => !solved.has(p.slug));
    const source = fresh.length >= preset.problems ? fresh : pool;
    const picked: ProblemRef[] = [];
    const left = [...source];
    while (picked.length < preset.problems && left.length) {
      const [chosen] = left.splice(randomInt(left.length), 1);
      if (chosen) picked.push({ slug: chosen.slug, title: chosen.title, difficulty: chosen.difficulty, category: chosen.category });
    }
    picked.sort((a, b) => (TIER_ORDER.get(a.difficulty) ?? 0) - (TIER_ORDER.get(b.difficulty) ?? 0));

    const now = this.clock.nowMs();
    const session: Session = {
      id: randomUUID(),
      preset: preset.id,
      problems: picked,
      startedAt: new Date(now).toISOString(),
      endsAt: new Date(now + preset.minutes * 60_000).toISOString(),
      finishedAt: null,
    };
    await this.store.set(key(userId), session, preset.minutes * 60_000 + KEEP_AFTER_END_MS);
    return this.view(userId, session);
  }

  async current(userId: string): Promise<InterviewView | null> {
    const session = await this.store.get<Session>(key(userId));
    return session ? this.view(userId, session) : null;
  }

  /** End the interview now (or confirm it already ended) and return the scorecard. */
  async finish(userId: string): Promise<InterviewView> {
    const session = await this.store.get<Session>(key(userId));
    if (!session) throw new NotFoundError("No interview to finish.");
    if (!session.finishedAt) {
      const now = this.clock.nowMs();
      session.finishedAt = new Date(Math.min(now, Date.parse(session.endsAt))).toISOString();
      await this.store.set(key(userId), session, KEEP_AFTER_END_MS);
    }
    return this.view(userId, session);
  }

  private async view(userId: string, session: Session): Promise<InterviewView> {
    const start = new Date(session.startedAt);
    const endMs = Math.min(Date.parse(session.endsAt), session.finishedAt ? Date.parse(session.finishedAt) : Infinity);
    const end = new Date(endMs);
    const outcomes: Record<string, ProblemOutcome> = {};
    for (const p of session.problems) {
      const subs = await this.submissions.listByUser(userId, HISTORY_LIMIT, p.slug);
      outcomes[p.slug] = interviewOutcome(subs, start, end);
    }
    const solved = Object.values(outcomes).filter((o) => o.status === "solved").length;
    const over = Boolean(session.finishedAt) || endMs <= this.clock.nowMs();
    return { ...session, outcomes, solved, verdict: over ? interviewVerdict(solved, session.problems.length) : null };
  }
}
