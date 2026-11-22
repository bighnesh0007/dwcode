/**
 * In-app notifications (SFCode parity, Phase A). `notify` is called from other
 * flows — a solve, a follow, a comment — and never fails them: a notification
 * that cannot be written is logged and dropped.
 */
import { contextLogger } from "../../lib/logger.ts";
import { deliverEmail } from "./email.ts";
import type { NewNotification, NotificationRepository } from "../../repositories/notification.repository.ts";

const PAGE = 30;

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

/** Links are site-relative paths only, so a notification can never point off-site. */
function safeLink(link: string | undefined): string {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : "";
}

/** What producers depend on: just `notify`. */
export interface Notifier {
  notify(userId: string, n: NewNotification): Promise<void>;
}

export class NotificationService implements Notifier {
  constructor(private readonly notifications: NotificationRepository) {}

  async notify(userId: string, n: NewNotification): Promise<void> {
    try {
      await this.notifications.create(userId, { ...n, link: safeLink(n.link) });
    } catch (err) {
      contextLogger().warn({ err, kind: n.kind }, "[notifications] could not record a notification");
      return;
    }
    // Email in the background: the flow that notified never waits on a mail server.
    void deliverEmail(userId, { ...n, link: safeLink(n.link) });
  }

  async list(userId: string): Promise<{ items: NotificationView[]; unread: number }> {
    const [rows, unread] = await Promise.all([this.notifications.list(userId, PAGE), this.notifications.unread(userId)]);
    return {
      unread,
      items: rows.map((r) => ({
        id: String(r._id),
        kind: r.kind,
        title: r.title,
        body: r.body ?? "",
        link: r.link ?? "",
        read: r.read,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    };
  }

  async unread(userId: string): Promise<{ unread: number }> {
    return { unread: await this.notifications.unread(userId) };
  }

  async markRead(userId: string, ids?: string[]): Promise<{ unread: number }> {
    await this.notifications.markRead(userId, ids);
    return this.unread(userId);
  }
}
