/**
 * Bookmarks — facade over mongo/bookmarks.ts and pg/bookmarks.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/bookmarks.ts";
import * as p from "./pg/bookmarks.ts";
import { pgImpl, read, write } from "./backend.ts";

export const listByUser = read("bookmarks.listByUser", m.listByUser,
  pgImpl<typeof m.listByUser>(p.listByUser), { ignoreId: true });
export const countByUser = read("bookmarks.countByUser", m.countByUser, p.countByUser);
/** The mirror applies Mongo's outcome rather than toggling, so a drifted row converges. */
export const toggle = write("bookmarks.toggle", m.toggle, p.toggle,
  (bookmarked, userId, problemId) => p.setBookmarked(userId, problemId, bookmarked));
