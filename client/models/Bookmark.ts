import mongoose from 'mongoose';
import { modelFromSchema } from './model';

export const BookmarkSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  problemSlug: { type: String, required: true },
  userId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

BookmarkSchema.index({ problemId: 1, userId: 1 }, { unique: true });

export const Bookmark = modelFromSchema('Bookmark', BookmarkSchema);
