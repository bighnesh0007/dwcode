import { Team } from "../../../models/Team.ts";
import { connect, isDuplicateKeyError } from "../shared.ts";

export interface NewTeam {
  slug: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  listed: boolean;
}

/** "duplicate" when the slug or invite code is taken, or the owner is already in a team. */
export async function create(t: NewTeam) {
  await connect();
  try {
    const doc = await Team.create({ ...t, members: [{ userId: t.ownerId }] });
    return doc.toObject();
  } catch (err) {
    if (isDuplicateKeyError(err)) return "duplicate" as const;
    throw err;
  }
}

export async function findBySlug(slug: string) {
  await connect();
  return Team.findOne({ slug }).lean();
}

export async function findByInviteCode(inviteCode: string) {
  await connect();
  return Team.findOne({ inviteCode }).lean();
}

export async function findForMember(userId: string) {
  await connect();
  return Team.findOne({ "members.userId": userId }).lean();
}

export async function listListed(limit: number) {
  await connect();
  return Team.find({ listed: true }).sort({ createdAt: -1 }).limit(limit).lean();
}

/** Every membership, for team leaderboards. */
export async function memberships(): Promise<{ slug: string; name: string; userId: string }[]> {
  await connect();
  const rows = await Team.find().select("slug name members.userId").lean();
  return rows.flatMap((t) => t.members.map((m) => ({ slug: t.slug, name: t.name, userId: m.userId })));
}

/**
 * Add a member, atomically bounded by `max`. "full" when the team has no room,
 * "taken" when the user is already in a team (this one or another).
 */
export async function addMember(slug: string, userId: string, max: number): Promise<"joined" | "full" | "taken" | "missing"> {
  await connect();
  try {
    const res = await Team.updateOne(
      { slug, "members.userId": { $ne: userId }, [`members.${max - 1}`]: { $exists: false } },
      { $push: { members: { userId, joinedAt: new Date() } } },
    );
    if (res.modifiedCount === 1) return "joined";
  } catch (err) {
    if (isDuplicateKeyError(err)) return "taken";
    throw err;
  }
  const team = await Team.findOne({ slug }).select("members.userId").lean();
  if (!team) return "missing";
  return team.members.some((m) => m.userId === userId) ? "taken" : "full";
}

export async function removeMember(slug: string, userId: string): Promise<void> {
  await connect();
  await Team.updateOne({ slug }, { $pull: { members: { userId } } });
}

export async function setListed(slug: string, listed: boolean): Promise<void> {
  await connect();
  await Team.updateOne({ slug }, { $set: { listed } });
}

export async function deleteBySlug(slug: string): Promise<void> {
  await connect();
  await Team.deleteOne({ slug });
}
