/** Bookmark persistence. */
import mongoose from "mongoose";
import { Bookmark } from "../models/Bookmark.ts";

export class BookmarkRepository {
  listByUser(userId: string) {
    return Bookmark.find({ userId }).lean();
  }

  /** Deletes the bookmark if present; true when one was removed. */
  async remove(userId: string, problemId: string): Promise<boolean> {
    const res = await Bookmark.deleteOne({ userId, problemId: new mongoose.Types.ObjectId(problemId) });
    return res.deletedCount > 0;
  }

  async create(userId: string, problemId: string, problemSlug: string): Promise<void> {
    await Bookmark.create({ userId, problemId: new mongoose.Types.ObjectId(problemId), problemSlug });
  }
}
