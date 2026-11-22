/** Profile extras (SFCode parity, Phase E) — delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as details from "../data/repositories/profileDetails.ts";
import type { ProfileDetailPatch } from "../data/repositories/profileDetails.ts";
import * as submissions from "../data/repositories/submissions.ts";

export class ProfileDetailRepository {
  get(userId: string) {
    return details.get(userId);
  }
  getMany(userIds: string[]) {
    return details.getMany(userIds);
  }
  upsert(userId: string, patch: ProfileDetailPatch) {
    return details.upsert(userId, patch);
  }
  listMentors(limit: number) {
    return details.listMentors(limit);
  }
  /** Recent Accepted solves by these users, for the activity feed. */
  acceptedByUsers(userIds: string[], limit: number) {
    return submissions.acceptedByUsers(userIds, limit);
  }
}
