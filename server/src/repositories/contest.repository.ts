/**
 * Contest persistence for background jobs. Mongoose queries only — no business
 * rules here.
 */
import mongoose from "mongoose";
import { Contest } from "../models/Contest.ts";
import { Problem } from "../models/Problem.ts";

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
   * Builds any missing indexes for the Contest collection — most importantly the
   * `seriesKey` unique sparse index that the weekly scheduler's race guard relies
   * on. This MUST be called deliberately because db/connection.ts disables
   * autoIndex in production, and the `contests` collection already exists there
   * (created by the client app, whose schema has no seriesKey). Without this call
   * the duplicate-key race guard would be silently absent in prod. Idempotent:
   * createIndexes only builds what is missing.
   */
  async ensureIndexes(): Promise<void> {
    await Contest.createIndexes();
  }

  async existsBySeriesKey(key: string): Promise<boolean> {
    return (await Contest.exists({ seriesKey: key })) !== null;
  }

  /**
   * Creates the contest. Deliberately catches NOTHING — the duplicate-key error
   * from the `seriesKey` unique index is how the service detects that a
   * concurrent instance won the scheduling race.
   */
  async create(doc: ContestCreateInput): Promise<void> {
    await Contest.create(doc);
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

/** Problem fields populated on list (`title slug difficulty`) and detail (+ `tags`). */
const LIST_PROBLEM_FIELDS = "title slug difficulty";
const DETAIL_PROBLEM_FIELDS = "title slug difficulty tags";

export class ContestQueryRepository {
  async list(filter: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    return Contest.find(filter as never)
      .sort({ startTime: -1 })
      .populate("problems", LIST_PROBLEM_FIELDS)
      .lean<Record<string, unknown>[]>();
  }

  async findDetail(id: string): Promise<Record<string, unknown> | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return Contest.findById(id).populate("problems", DETAIL_PROBLEM_FIELDS).lean<Record<string, unknown>>();
  }

  async findIdByInviteCode(inviteCode: string): Promise<string | null> {
    const row = await Contest.findOne({ inviteCode }).select("_id").lean();
    return row ? String(row._id) : null;
  }

  async joinState(id: string, userId: string): Promise<ContestJoinState | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    const rows = await Contest.aggregate<{
      _id: mongoose.Types.ObjectId;
      isPublic: boolean;
      endTime: Date;
      maxParticipants: number;
      participantCount: number;
      isParticipant: boolean;
    }>([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $project: {
          isPublic: 1,
          endTime: 1,
          maxParticipants: 1,
          participantCount: { $size: { $ifNull: ["$participants", []] } },
          isParticipant: { $in: [userId, { $ifNull: ["$participants.userId", []] }] },
        },
      },
    ]);
    const r = rows[0];
    if (!r) return null;
    return {
      id: String(r._id),
      isPublic: r.isPublic,
      endTime: r.endTime,
      maxParticipants: r.maxParticipants,
      participantCount: r.participantCount,
      isParticipant: r.isParticipant,
    };
  }

  /**
   * Atomic join: a single conditional update, so two concurrent joins can never
   * both pass the "not already in" and "not full" checks. The caller re-reads
   * state to explain a `not_applied` result.
   */
  async addParticipant(
    id: string,
    participant: ContestParticipantRow,
    opts: { now: Date; requirePublic: boolean },
  ): Promise<JoinOutcome> {
    if (!mongoose.isValidObjectId(id)) return "not_applied";
    const filter: Record<string, unknown> = {
      _id: new mongoose.Types.ObjectId(id),
      endTime: { $gte: opts.now },
      "participants.userId": { $ne: participant.userId },
      $expr: { $lt: [{ $size: { $ifNull: ["$participants", []] } }, "$maxParticipants"] },
    };
    if (opts.requirePublic) filter.isPublic = true;
    const res = await Contest.updateOne(filter, {
      $push: {
        participants: {
          userId: participant.userId,
          userName: participant.userName,
          userImageUrl: participant.userImageUrl,
          score: participant.score,
          solvedProblems: participant.solvedProblems,
          joinedAt: participant.joinedAt,
        },
      },
    });
    return res.modifiedCount === 1 ? "joined" : "not_applied";
  }

  /** Returns false when the contest does not exist. */
  async removeParticipant(id: string, userId: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) return false;
    const res = await Contest.updateOne({ _id: id }, { $pull: { participants: { userId } } });
    return res.matchedCount === 1;
  }

  async findOwner(id: string): Promise<string | null | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const row = await Contest.findById(id).select("createdBy").lean();
    return row ? row.createdBy : undefined;
  }

  /** Deletes only when `createdBy` still matches — no check-then-act gap. */
  async deleteOwned(id: string, userId: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) return false;
    const res = await Contest.deleteOne({ _id: id, createdBy: userId });
    return res.deletedCount === 1;
  }

  async create(doc: UserContestCreateInput): Promise<Record<string, unknown>> {
    const created = await Contest.create({
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
      ...(doc.inviteCode === undefined ? {} : { inviteCode: doc.inviteCode }),
      participants: [],
    });
    return created.toObject();
  }

  async findProblemsByIds(ids: string[]): Promise<{ _id: mongoose.Types.ObjectId; slug: string }[]> {
    const rows = await Problem.find({ _id: { $in: ids } }).select("_id slug").lean();
    return rows.map((r) => ({ _id: r._id, slug: r.slug }));
  }
}
