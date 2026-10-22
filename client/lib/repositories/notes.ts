import { Note } from "@/models/Note";
import { connect } from "./shared";

/** The user's own note for a problem. Always scoped by userId. */
export async function findOwn(userId: string, problemId: string) {
  await connect();
  return Note.findOne({ userId, problemId }).lean();
}

/**
 * Create or replace the user's note. Scoped by userId on BOTH the filter and
 * the update, so an upsert can never create or claim someone else's row.
 */
export async function saveOwn(userId: string, problemId: string, problemSlug: string, content: string) {
  await connect();
  return Note.findOneAndUpdate(
    { userId, problemId },
    { userId, problemId, problemSlug, content, updatedAt: new Date() },
    { upsert: true, returnDocument: "after" },
  ).lean();
}
