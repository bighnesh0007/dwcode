import { Notification } from "../../../models/Notification.ts";
import { connect } from "../shared.ts";

export interface NewNotification {
  kind: string;
  title: string;
  body?: string;
  link?: string;
}

export async function create(userId: string, n: NewNotification) {
  await connect();
  const doc = await Notification.create({ userId, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link ?? "" });
  return doc.toObject();
}

/** The user's newest notifications. */
export async function listForUser(userId: string, limit: number) {
  await connect();
  return Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function countUnread(userId: string): Promise<number> {
  await connect();
  return Notification.countDocuments({ userId, read: false });
}

/** Mark the user's notifications read: the given ids, or all when none are given. */
export async function markRead(userId: string, ids?: string[]): Promise<void> {
  await connect();
  const filter = ids ? { userId, _id: { $in: ids } } : { userId, read: false };
  await Notification.updateMany(filter, { $set: { read: true } });
}
