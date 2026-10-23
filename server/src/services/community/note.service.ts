/** Private per-user notes (audit C-3: every read and write is scoped by the session's userId). */
import { LIMITS } from "@dwcode/shared";
import { PayloadTooLargeError } from "../../errors/AppError.ts";
import type { NoteRepository } from "../../repositories/note.repository.ts";

export class NoteService {
  constructor(private readonly notes: NoteRepository) {}

  async get(userId: string, problemId: string) {
    return (await this.notes.findForUser(userId, problemId)) ?? { content: "" };
  }

  save(userId: string, problemId: string, problemSlug: string, content: string) {
    if (content.length > LIMITS.note.maxLength) throw new PayloadTooLargeError("Note is too large.");
    return this.notes.upsert(userId, problemId, problemSlug, content);
  }
}
