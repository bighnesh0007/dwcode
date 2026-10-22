import { Submission } from "@/models/Submission";
import { connect, type RecordId } from "./shared";

export interface NewSubmission {
  problemId: RecordId;
  problemSlug: string;
  userId: string;
  userName: string;
  userImageUrl: string;
  code: string;
  input: string;
  output: string;
  status: string;
  executionTime: string;
}

/** A user's submissions, newest first. */
export async function listByUser(userId: string) {
  await connect();
  return Submission.find({ userId }).sort({ createdAt: -1 }).lean();
}

/** Every submission. The leaderboard still aggregates in memory (see its route). */
export async function listAll() {
  await connect();
  return Submission.find().lean();
}

/** Insert a submission; returns the stored record. */
export async function create(submission: NewSubmission) {
  await connect();
  const doc = await Submission.create(submission);
  return doc.toObject();
}

/** Whether the user has an Accepted submission for the problem other than `exceptId`. */
export async function hasOtherAccepted(userId: string, problemId: RecordId, exceptId: RecordId): Promise<boolean> {
  await connect();
  const count = await Submission.countDocuments({
    userId,
    problemId,
    status: "Accepted",
    _id: { $ne: exceptId },
  });
  return count > 0;
}

export async function hasAcceptedForSlug(userId: string, problemSlug: string): Promise<boolean> {
  await connect();
  return Boolean(await Submission.exists({ userId, problemSlug, status: "Accepted" }));
}

/** Distinct problem slugs the user has solved, and has attempted without an Accepted run. */
export async function slugsByOutcome(userId: string) {
  await connect();
  const [accepted, notAccepted] = await Promise.all([
    Submission.distinct("problemSlug", { userId, status: "Accepted" }),
    Submission.distinct("problemSlug", { userId, status: { $ne: "Accepted" } }),
  ]);
  return { accepted, notAccepted };
}

export interface SubmissionUserStats {
  _id: string;
  userName?: string;
  userImageUrl?: string;
  totalSubmissions: number;
  accepted: number;
  firstSeenAt?: Date;
  lastActiveAt?: Date;
  solvedSlugs: string[];
}

/** Per-user activity totals — for the admin directory. */
export async function statsByUser() {
  await connect();
  return Submission.aggregate<SubmissionUserStats>([
    {
      $group: {
        _id: "$userId",
        userName: { $last: "$userName" },
        userImageUrl: { $last: "$userImageUrl" },
        totalSubmissions: { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ["$status", "Accepted"] }, 1, 0] } },
        firstSeenAt: { $min: "$createdAt" },
        lastActiveAt: { $max: "$createdAt" },
        solvedSlugs: {
          $addToSet: {
            $cond: [{ $eq: ["$status", "Accepted"] }, "$problemSlug", "$$REMOVE"],
          },
        },
      },
    },
  ]);
}
