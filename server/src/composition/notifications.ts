/**
 * Domain module: notifications and the announcement banner.
 * Built from DomainDeps only.
 */
import { NotificationsController } from "../controllers/notifications.controller.ts";
import { NotificationRepository, SettingsRepository } from "../repositories/notification.repository.ts";
import { announcementRoutes, notificationRoutes } from "../routes/v1/notifications.routes.ts";
import { AnnouncementService } from "../services/notifications/announcement.service.ts";
import { NotificationService } from "../services/notifications/notification.service.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

/** Shared by every domain that produces notifications. */
export function buildNotificationService(): NotificationService {
  return new NotificationService(new NotificationRepository());
}

export function buildNotificationsDomain(deps: DomainDeps): DomainModule[] {
  const controller = new NotificationsController(
    buildNotificationService(),
    new AnnouncementService(new SettingsRepository(), deps.clock),
  );
  const v = deps.tokenVerifier;
  return [
    { path: "/notifications", router: notificationRoutes(controller, v) },
    { path: "/announcement", router: announcementRoutes(controller, v) },
  ];
}
