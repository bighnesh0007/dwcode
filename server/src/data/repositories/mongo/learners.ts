import { LearnerState } from "../../../models/LearnerState.ts";
import { connect } from "../shared.ts";

export async function get(userId: string): Promise<unknown> {
  await connect();
  const doc = await LearnerState.findOne({ userId }).lean();
  return doc?.state ?? null;
}

/** Create or replace a learner's state. */
export async function put(userId: string, state: unknown): Promise<void> {
  await connect();
  await LearnerState.findOneAndUpdate({ userId }, { userId, state, updatedAt: new Date() }, { upsert: true });
}
