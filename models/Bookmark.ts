import mongoose from 'mongoose';

const BookmarkSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true, unique: true },
  problemSlug: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Bookmark = mongoose.models.Bookmark || mongoose.model('Bookmark', BookmarkSchema);
