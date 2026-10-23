/**
 * User profiles and follows — facade over mongo/profiles.ts and pg/profiles.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/profiles";
import * as p from "./pg/profiles";
import { pgImpl, read, write } from "./backend";

const edges = { ignoreId: true, unordered: ["followers", "following"] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic over the read signatures below
const profile = <F extends (...a: any[]) => Promise<unknown>>(op: string, mongo: F, pg: F) =>
  read(`profiles.${op}`, mongo, pg, edges);

export const findByUserId = profile("findByUserId", m.findByUserId, pgImpl<typeof m.findByUserId>(p.findByUserId));
export const findByUsername = profile("findByUsername", m.findByUsername, pgImpl<typeof m.findByUsername>(p.findByUsername));
export const findByUsernameIgnoreCase = profile("findByUsernameIgnoreCase", m.findByUsernameIgnoreCase,
  pgImpl<typeof m.findByUsernameIgnoreCase>(p.findByUsernameIgnoreCase));
export const usernameExists = read("profiles.usernameExists", m.usernameExists, p.usernameExists);
export const create = write("profiles.create", m.create, pgImpl<typeof m.create>(p.create),
  (doc, userId, username) => p.create(userId, username, { createdAt: doc.createdAt }));
export const upsertUsernameAndBio = write("profiles.upsertUsernameAndBio", m.upsertUsernameAndBio,
  pgImpl<typeof m.upsertUsernameAndBio>(p.upsertUsernameAndBio));
export const isFollowing = read("profiles.isFollowing", m.isFollowing, p.isFollowing);
export const follow = write("profiles.follow", m.follow, p.follow);
export const unfollow = write("profiles.unfollow", m.unfollow, p.unfollow);
export const usernamesByUserId = read("profiles.usernamesByUserId", m.usernamesByUserId, p.usernamesByUserId);
export const listAllSummaries = read("profiles.listAllSummaries", m.listAllSummaries,
  pgImpl<typeof m.listAllSummaries>(p.listAllSummaries), { ignoreId: true });
