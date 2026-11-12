/** Bookmark persistence. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as bookmarks from "../data/repositories/bookmarks.ts";

export class BookmarkRepository {
  listByUser(userId: string) {
    return bookmarks.listByUser(userId);
  }

  /** Add the bookmark if absent, remove it if present. Returns the new state. */
  toggle(userId: string, problemId: string, problemSlug: string): Promise<boolean> {
    return bookmarks.toggle(userId, problemId, problemSlug);
  }
}
