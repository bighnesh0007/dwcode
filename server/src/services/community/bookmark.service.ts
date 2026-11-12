/** Problem bookmarks: a per-user toggle. */
import type { BookmarkRepository } from "../../repositories/bookmark.repository.ts";

export class BookmarkService {
  constructor(private readonly bookmarks: BookmarkRepository) {}

  /** Anonymous callers get an empty list, as before. */
  list(userId: string | undefined) {
    return userId ? this.bookmarks.listByUser(userId) : Promise.resolve([]);
  }

  async toggle(userId: string, problemId: string, problemSlug: string): Promise<{ bookmarked: boolean }> {
    return { bookmarked: await this.bookmarks.toggle(userId, problemId, problemSlug) };
  }
}
