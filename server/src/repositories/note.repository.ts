/**
 * Private study-note persistence. Every query is scoped by userId (audit C-3).
 * Delegates to data/repositories, where DATA_BACKEND picks the database.
 */
import * as notes from "../data/repositories/notes.ts";

export class NoteRepository {
  findForUser(userId: string, problemId: string) {
    return notes.findOwn(userId, problemId);
  }

  /** userId is on BOTH the filter and the update, so an upsert can never claim another user's row. */
  upsert(userId: string, problemId: string, problemSlug: string, content: string) {
    return notes.saveOwn(userId, problemId, problemSlug, content);
  }
}
