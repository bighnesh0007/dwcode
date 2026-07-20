import mongoose from 'mongoose';
import { modelFromSchema } from './model';

export const NoteSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true, unique: true },
  problemSlug: { type: String, required: true },
  content: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

export const Note = modelFromSchema('Note', NoteSchema);
