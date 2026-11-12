/**
 * Contest persistence — no business rules. Delegates to data/repositories,
 * where DATA_BACKEND picks the database.
 */
import type mongoose from "mongoose";
import * as contests from "../data/repositories/contests.ts";
import * as problems from "../data/repositories/problems.ts";

/** Everything the weekly scheduler writes when it creates a contest. */
export interface ContestCreateInput {
  seriesKey: string;
  title: string;
  description: string;
  createdBy: string;
  createdByName: string;
  problems: mongoose.Types.ObjectId[];
  problemSlugs: string[];
  startTime: Date;
  endTime: Date;
  duration: number;
  status: "upcoming";
  isPublic: boolean;
  maxParticipants: number;
  participants: never[];
}

export class ContestRepository {
  /**
   * Builds missing indexes — above all the `seriesKey` unique index the weekly
   * scheduler's race guard relies on (autoIndex is off in production). On
   * Postgres the migrations own the index. Idempotent.
   */
  ensureIndexes(): Promise<void> {
    return contests.ensureIndexes();
  }

  existsBySeriesKey(key: string): Promise<boolean> {
    return contests.existsBySeriesKey(key);
  }

  /**
   * Creates the contest. Deliberately catches NOTHING — the duplicate-key error
   * from the `seriesKey` unique index is how the service detects that a
   * concurrent instance won the scheduling race.
   */
  async create(doc: ContestCreateInput): Promise<void> {
    await contests.create({
      seriesKey: doc.seriesKey,
      title: doc.title,
      description: doc.description,
      createdBy: doc.createdBy,
      createdByName: doc.createdByName,
      problems: doc.problems,
      problemSlugs: doc.problemSlugs,
      startTime: doc.startTime,
      endTime: doc.endTime,
      duration: doc.duration,
      status: doc.status,
      isPublic: doc.isPublic,
      maxParticipants: doc.maxParticipants,
      inviteCode: undefined,
    });
  }
}

/** A participant row as stored. */
export interface ContestParticipantRow {
  userId: string;
  userName: string;
  userImageUrl: string;
  score: number;
  solvedProblems: string[];
  joinedAt: Date;
}

/** Fields a user-created contest is written with — mapped explicitly, never spread. */
export interface UserContestCreateInput {
  title: string;
  description: string;
  createdBy: string;
  createdByName: string;
  problems: mongoose.Types.ObjectId[];
  problemSlugs: string[];
  startTime: Date;
  endTime: Date;
  duration: number;
  status: "upcoming" | "active" | "ended";
  isPublic: boolean;
  maxParticipants: number;
  inviteCode?: string;
}

/** Minimal state needed to explain why an atomic join did not apply. */
export interface ContestJoinState {
  id: string;
  isPublic: boolean;
  endTime: Date;
  maxParticipants: number;
  participantCount: number;
  isParticipant: boolean;
}

export type JoinOutcome = "joined" | "not_applied";

export class ContestQueryRepository {
  /** Public contests, plus — when signed in — those the user created or joined. Newest first. */
  async list(userId: string | undefined): Promise<Record<string, unknown>[]> {
    return contests.listVisible(userId ?? null);
  }

  async findDetail(id: string): Promise<Record<string, unknown> | null> {
    if (!problems.isValidId(id)) return null;
    return contests.findWithProblems(id);
  }

  async findIdByInviteCode(inviteCode: string): Promise<string | null> {
    const row = await contests.findByInviteCode(inviteCode);
    return row ? String(row._id) : null;
  }

  joinState(id: string, userId: string): Promise<ContestJoinState | null> {
    return contests.joinState(id, userId);
  }

  /**
   * Atomic join: two concurrent joins can never both pass the "not already in"
   * and "not full" checks. The caller re-reads state to explain `not_applied`.
   */
  addParticipant(
    id: string,
    participant: ContestParticipantRow,
    opts: { now: Date; requirePublic: boolean },
  ): Promise<JoinOutcome> {
    return contests.joinIfOpen(id, participant, opts);
  }

  /** Returns false when the contest does not exist. */
  removeParticipant(id: string, userId: string): Promise<boolean> {
    return contests.removeParticipant(id, userId);
  }

  async findOwner(id: string): Promise<string | null | undefined> {
    if (!problems.isValidId(id)) return undefined;
    const row = await contests.findById(id);
    return row ? row.createdBy : undefined;
  }

  /** Deletes only when `createdBy` still matches — no check-then-act gap. */
  deleteOwned(id: string, userId: string): Promise<boolean> {
    return contests.deleteOwned(id, userId);
  }

  async create(doc: UserContestCreateInput): Promise<Record<string, unknown>> {
    return contests.create({
      title: doc.title,
      description: doc.description,
      createdBy: doc.createdBy,
      createdByName: doc.createdByName,
      problems: doc.problems,
      problemSlugs: doc.problemSlugs,
      startTime: doc.startTime,
      endTime: doc.endTime,
      duration: doc.duration,
      status: doc.status,
      isPublic: doc.isPublic,
      maxParticipants: doc.maxParticipants,
      inviteCode: doc.inviteCode,
    });
  }

  async findProblemsByIds(ids: string[]): Promise<{ _id: mongoose.Types.ObjectId; slug: string }[]> {
    const valid = ids.filter((id) => problems.isValidId(id));
    const rows = await problems.findByIds(valid, valid.length);
    return rows.map((r) => ({ _id: r._id, slug: r.slug }));
  }
}
