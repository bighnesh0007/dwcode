import mongoose from 'mongoose';
import { modelFromSchema } from './model';

export const BookmarkSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  problemSlug: { type: String, required: true },
  userId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

BookmarkSchema.index({ problemId: 1, userId: 1 }, { unique: true });
// PERF-02: the unique index above is prefixed on problemId, so it does NOT serve
// Bookmark.find({ userId }) — the query behind the bookmarks list and count.
BookmarkSchema.index({ userId: 1 });

export const Bookmark = modelFromSchema('Bookmark', BookmarkSchema);
