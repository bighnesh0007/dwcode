/**
 * In-app notifications — facade over mongo/notifications.ts and pg/notifications.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/notifications.ts";
import * as p from "./pg/notifications.ts";
import { pgImpl, read, write } from "./backend.ts";

export type { NewNotification } from "./mongo/notifications.ts";

export const create = write("notifications.create", m.create, pgImpl<typeof m.create>(p.create),
  (doc, userId, n) => p.create(userId, n, { id: String(doc._id), createdAt: doc.createdAt }));
export const listForUser = read("notifications.listForUser", m.listForUser, pgImpl<typeof m.listForUser>(p.listForUser));
export const countUnread = read("notifications.countUnread", m.countUnread, p.countUnread);
export const markRead = write("notifications.markRead", m.markRead, p.markRead);
