/** Private study-note persistence. Every query is scoped by userId (audit C-3). */
import mongoose from "mongoose";
import { Note } from "../models/Note.ts";

export class NoteRepository {
  findForUser(userId: string, problemId: string) {
    return Note.findOne({ userId, problemId: new mongoose.Types.ObjectId(problemId) }).lean();
  }

  /** userId is on BOTH the filter and the update, so an upsert can never claim another user's row. */
  upsert(userId: string, problemId: string, problemSlug: string, content: string) {
    const oid = new mongoose.Types.ObjectId(problemId);
    return Note.findOneAndUpdate(
      { userId, problemId: oid },
      { userId, problemId: oid, problemSlug, content, updatedAt: new Date() },
      { upsert: true, returnDocument: "after" },
    ).lean();
  }
}
