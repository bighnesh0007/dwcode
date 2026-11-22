/** Reads behind practice modes. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as profiles from "../data/repositories/profiles.ts";
import * as submissions from "../data/repositories/submissions.ts";

export class PracticeRepository {
  acceptedForProblem(problemSlug: string, limit: number) {
    return submissions.acceptedForProblem(problemSlug, limit);
  }

  usernames(userIds: string[]): Promise<Map<string, string>> {
    return profiles.usernamesByUserId(userIds);
  }
}
