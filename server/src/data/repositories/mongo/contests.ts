import type { InferSchemaType } from "mongoose";
import { Contest } from "../../../models/Contest.ts";
import type { ProblemSchema } from "../../../models/Problem.ts";
import { connect, isValidId, type RecordId } from "../shared.ts";

type PopulatedProblem = InferSchemaType<typeof ProblemSchema>;

export interface Participant {
  userId: string;
  userName: string;
  userImageUrl: string;
}

/**
 * Contests visible to `userId`: public ones, plus — when signed in — those they
 * created or joined. Newest first, with problem summaries attached.
 */
export async function listVisible(userId: string | null) {
  await connect();
  const visibility = userId
    ? { $or: [{ isPublic: true }, { createdBy: userId }, { "participants.userId": userId }] }
    : { isPublic: true };
  return Contest.find(visibility)
    .sort({ startTime: -1 })
    .populate<{ problems: PopulatedProblem[] }>("problems", "title slug difficulty")
    .lean();
}

/** One contest with problem summaries attached. */
export async function findWithProblems(id: string) {
  await connect();
  return Contest.findById(id).populate("problems", "title slug difficulty tags").lean();
}

export async function findById(id: string) {
  await connect();
  return Contest.findById(id).lean();
}

export async function findByInviteCode(inviteCode: string) {
  await connect();
  return Contest.findOne({ inviteCode }).lean();
}

export async function create(fields: {
  title: string;
  description: string;
  createdBy: string;
  createdByName: string;
  problems: RecordId[];
  problemSlugs: string[];
  startTime: Date;
  endTime: Date;
  duration: number;
  status: "upcoming" | "active" | "ended";
  isPublic: boolean;
  maxParticipants: number;
  inviteCode: string | undefined;
  /** Idempotency key for auto-generated contests; a duplicate throws E11000. */
  seriesKey?: string;
}) {
  await connect();
  // Absent optional keys are omitted, not written as undefined (exactOptionalPropertyTypes).
  const { inviteCode, seriesKey, ...rest } = fields;
  const doc = await Contest.create({
    ...rest,
    ...(inviteCode === undefined ? {} : { inviteCode }),
    ...(seriesKey === undefined ? {} : { seriesKey }),
    participants: [],
  });
  return doc.toObject();
}

/**
 * Builds missing Contest indexes — above all the `seriesKey` unique index the
 * weekly scheduler's race guard relies on. autoIndex is off in production, so
 * this must be called deliberately. Idempotent.
 */
export async function ensureIndexes(): Promise<void> {
  await connect();
  await Contest.createIndexes();
}

export async function existsBySeriesKey(seriesKey: string): Promise<boolean> {
  await connect();
  return Boolean(await Contest.exists({ seriesKey }));
}

/** What an atomic join needs to explain why it did not apply. */
export interface JoinState {
  id: string;
  isPublic: boolean;
  endTime: Date;
  maxParticipants: number;
  participantCount: number;
  isParticipant: boolean;
}

export async function joinState(contestId: string, userId: string): Promise<JoinState | null> {
  if (!isValidId(contestId)) return null;
  await connect();
  const doc = await Contest.findById(contestId).select("isPublic endTime maxParticipants participants.userId").lean();
  if (!doc) return null;
  const participants = doc.participants ?? [];
  return {
    id: String(doc._id),
    isPublic: doc.isPublic,
    endTime: doc.endTime,
    maxParticipants: doc.maxParticipants,
    participantCount: participants.length,
    isParticipant: participants.some((p) => p.userId === userId),
  };
}

export interface JoiningParticipant extends Participant {
  score: number;
  solvedProblems: string[];
  joinedAt: Date;
}

/**
 * Join only if the contest has not ended, is not full, the user is not already
 * in it and (when `requirePublic`) it is public — as ONE conditional update, so
 * two concurrent joins can never both take the last place.
 */
export async function joinIfOpen(
  contestId: string,
  participant: JoiningParticipant,
  opts: { now: Date; requirePublic: boolean },
): Promise<"joined" | "not_applied"> {
  if (!isValidId(contestId)) return "not_applied";
  await connect();
  const filter: Record<string, unknown> = {
    _id: contestId,
    endTime: { $gte: opts.now },
    "participants.userId": { $ne: participant.userId },
    $expr: { $lt: [{ $size: { $ifNull: ["$participants", []] } }, "$maxParticipants"] },
  };
  if (opts.requirePublic) filter.isPublic = true;
  const res = await Contest.updateOne(filter, { $push: { participants: { ...participant } } });
  return res.modifiedCount === 1 ? "joined" : "not_applied";
}

/** Delete only when `createdBy` still matches — no check-then-act gap. */
export async function deleteOwned(contestId: string, userId: string): Promise<boolean> {
  if (!isValidId(contestId)) return false;
  await connect();
  return (await Contest.deleteOne({ _id: contestId, createdBy: userId })).deletedCount === 1;
}

/** Add a participant. A no-op when they have already joined. */
export async function addParticipant(contestId: RecordId, participant: Participant) {
  await connect();
  await Contest.updateOne(
    { _id: contestId, "participants.userId": { $ne: participant.userId } },
    { $push: { participants: { ...participant, score: 0, solvedProblems: [], joinedAt: new Date() } } },
  );
}

/** Returns false when the contest does not exist. */
export async function removeParticipant(contestId: RecordId, userId: string): Promise<boolean> {
  if (!isValidId(String(contestId))) return false;
  await connect();
  const res = await Contest.updateOne({ _id: contestId }, { $pull: { participants: { userId } } });
  return res.matchedCount === 1;
}

export async function deleteById(id: string) {
  await connect();
  await Contest.findByIdAndDelete(id);
}
