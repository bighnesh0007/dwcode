import type { InferSchemaType } from "mongoose";
import { Contest } from "../../../models/Contest.ts";
import type { ProblemSchema } from "../../../models/Problem.ts";
import { connect, type RecordId } from "../shared.ts";

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
}) {
  await connect();
  // An absent invite code is omitted, not written as undefined (exactOptionalPropertyTypes).
  const { inviteCode, ...rest } = fields;
  const doc = await Contest.create({ ...rest, ...(inviteCode === undefined ? {} : { inviteCode }), participants: [] });
  return doc.toObject();
}

/** Add a participant. A no-op when they have already joined. */
export async function addParticipant(contestId: RecordId, participant: Participant) {
  await connect();
  await Contest.updateOne(
    { _id: contestId, "participants.userId": { $ne: participant.userId } },
    { $push: { participants: { ...participant, score: 0, solvedProblems: [], joinedAt: new Date() } } },
  );
}

export async function removeParticipant(contestId: RecordId, userId: string) {
  await connect();
  await Contest.updateOne({ _id: contestId }, { $pull: { participants: { userId } } });
}

export async function deleteById(id: string) {
  await connect();
  await Contest.findByIdAndDelete(id);
}
