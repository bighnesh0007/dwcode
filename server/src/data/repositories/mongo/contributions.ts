import { isValidObjectId } from "mongoose";
import { Contribution } from "../../../models/Contribution.ts";
import { connect } from "../shared.ts";

export interface NewContribution {
  kind: string;
  authorId: string;
  status: string;
  payload: unknown;
}

export interface ContributionPatch {
  status?: string;
  payload?: unknown;
  check?: unknown;
  reviewNote?: string;
  reviewedBy?: string;
  publishedRef?: string;
}

export async function create(c: NewContribution) {
  await connect();
  const doc = await Contribution.create({ ...c, check: null });
  return doc.toObject();
}

export async function findById(id: string) {
  if (!isValidObjectId(id)) return null;
  await connect();
  return Contribution.findById(id).lean();
}

/** The author's contributions, newest first. */
export async function listByAuthor(authorId: string, limit: number) {
  await connect();
  return Contribution.find({ authorId }).sort({ createdAt: -1 }).limit(limit).lean();
}

/** A status queue, oldest first (the review order); optionally one kind. */
export async function listByStatus(status: string, kind: string | undefined, limit: number) {
  await connect();
  return Contribution.find({ status, ...(kind ? { kind } : {}) }).sort({ createdAt: 1 }).limit(limit).lean();
}

export async function countByAuthor(authorId: string, kind: string, statuses: string[]): Promise<number> {
  await connect();
  return Contribution.countDocuments({ authorId, kind, status: { $in: statuses } });
}

/**
 * Apply `patch` only while the contribution is in one of `from` — one atomic
 * step, so two reviewers cannot both approve. Null when it was not.
 */
export async function transition(id: string, from: string[], patch: ContributionPatch) {
  if (!isValidObjectId(id)) return null;
  await connect();
  return Contribution.findOneAndUpdate({ _id: id, status: { $in: from } }, { ...patch, updatedAt: new Date() }, { returnDocument: "after" }).lean();
}

/** Delete one of the author's drafts. */
export async function removeDraft(id: string, authorId: string): Promise<boolean> {
  if (!isValidObjectId(id)) return false;
  await connect();
  return (await Contribution.deleteOne({ _id: id, authorId, status: "draft" })).deletedCount > 0;
}
