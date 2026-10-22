/**
 * Contests — facade over mongo/contests.ts and pg/contests.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/contests";
import * as p from "./pg/contests";
import { pgImpl, read, write } from "./backend";

export type { Participant } from "./mongo/contests";
export const listVisible = read("contests.listVisible", m.listVisible, pgImpl<typeof m.listVisible>(p.listVisible));
export const findWithProblems = read("contests.findWithProblems", m.findWithProblems,
  pgImpl<typeof m.findWithProblems>(p.findWithProblems));
export const findById = read("contests.findById", m.findById, pgImpl<typeof m.findById>(p.findById));
export const findByInviteCode = read("contests.findByInviteCode", m.findByInviteCode,
  pgImpl<typeof m.findByInviteCode>(p.findByInviteCode));
export const create = write("contests.create", m.create, pgImpl<typeof m.create>(p.create),
  (doc, fields) => p.create(fields, { id: String(doc._id), createdAt: doc.createdAt }));
export const addParticipant = write("contests.addParticipant", m.addParticipant, p.addParticipant);
export const removeParticipant = write("contests.removeParticipant", m.removeParticipant, p.removeParticipant);
export const deleteById = write("contests.deleteById", m.deleteById, p.deleteById);
