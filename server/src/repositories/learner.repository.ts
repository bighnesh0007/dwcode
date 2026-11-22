/** Learner path state (SFCode parity, Phase D) — delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as learners from "../data/repositories/learners.ts";

export class LearnerRepository {
  get(userId: string): Promise<unknown> {
    return learners.get(userId);
  }

  put(userId: string, state: unknown): Promise<void> {
    return learners.put(userId, state);
  }
}
