import mongoose from 'mongoose';
import { modelFromSchema } from './model';

/**
 * A user's private study note for one problem.
 *
 * SECURITY HISTORY (audit finding C-3). `problemId` used to carry
 * `unique: true` and there was no `userId` field at all, so the schema itself
 * enforced ONE note per problem shared by every user on the platform. Combined
 * with an unauthenticated route, any visitor could read and overwrite everyone's
 * notes. Ownership is now part of the key.
 *
 * The old `problemId_1` unique index must be dropped for this to work — a
 * second user writing a note for a problem that already has one would otherwise
 * hit a duplicate-key error. See scripts/migrations/001-scope-notes-to-user.mjs.
 */
export const NoteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  problemSlug: { type: String, required: true },
  content: { type: String, default: '', maxlength: 20000 },
  updatedAt: { type: Date, default: Date.now },
});

// One note per user per problem. This is what makes the upsert in
// /api/notes idempotent and prevents a user accumulating duplicate rows.
NoteSchema.index({ userId: 1, problemId: 1 }, { unique: true });

export const Note = modelFromSchema('Note', NoteSchema);
