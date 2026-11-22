import { ProfileDetail } from "../../../models/ProfileDetail.ts";
import { connect } from "../shared.ts";

export interface ProfileDetailPatch {
  headline?: string;
  about?: string;
  links?: Record<string, string>;
  equipped?: Record<string, string>;
  mentorActive?: boolean;
  mentorTopics?: string[];
  mentorNote?: string;
  emailPrefs?: Record<string, boolean>;
}

const FIELDS = "userId headline about links equipped mentorActive mentorTopics mentorNote emailPrefs updatedAt -_id";

export async function get(userId: string) {
  await connect();
  return ProfileDetail.findOne({ userId }).select(FIELDS).lean();
}

export async function getMany(userIds: string[]) {
  if (userIds.length === 0) return [];
  await connect();
  return ProfileDetail.find({ userId: { $in: userIds } }).select(FIELDS).sort({ userId: 1 }).lean();
}

/** Create or update the given fields. */
export async function upsert(userId: string, patch: ProfileDetailPatch) {
  await connect();
  return ProfileDetail.findOneAndUpdate(
    { userId },
    { $set: { ...patch, updatedAt: new Date() }, $setOnInsert: { userId } },
    { upsert: true, returnDocument: "after", projection: FIELDS },
  ).lean();
}

/** Active mentors, most recently updated first. */
export async function listMentors(limit: number) {
  await connect();
  return ProfileDetail.find({ mentorActive: true }).select(FIELDS).sort({ updatedAt: -1 }).limit(limit).lean();
}
