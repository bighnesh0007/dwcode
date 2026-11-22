/** Notifications and site settings. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as notifications from "../data/repositories/notifications.ts";
import * as settings from "../data/repositories/settings.ts";

export type { NewNotification } from "../data/repositories/notifications.ts";

export class NotificationRepository {
  create(userId: string, n: notifications.NewNotification) {
    return notifications.create(userId, n);
  }

  list(userId: string, limit: number) {
    return notifications.listForUser(userId, limit);
  }

  unread(userId: string): Promise<number> {
    return notifications.countUnread(userId);
  }

  markRead(userId: string, ids?: string[]): Promise<void> {
    return notifications.markRead(userId, ids);
  }
}

export class SettingsRepository {
  get(key: string): Promise<unknown> {
    return settings.get(key);
  }

  set(key: string, value: unknown, updatedBy: string): Promise<void> {
    return settings.set(key, value, updatedBy);
  }
}
