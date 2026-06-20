import mongoose from 'mongoose';

const NoteSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true, unique: true },
  problemSlug: { type: String, required: true },
  content: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

export const Note = mongoose.models.Note || mongoose.model('Note', NoteSchema);
