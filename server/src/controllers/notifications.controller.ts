/**
 * HTTP adapter for notifications and the announcement banner.
 *
 *   GET  /api/v1/notifications           auth: newest 30 + unread count
 *   GET  /api/v1/notifications/unread    auth: unread count (polled by the bell)
 *   POST /api/v1/notifications/read      auth: mark given ids, or all, read
 *   GET  /api/v1/announcement            public
 *   PUT  /api/v1/announcement            admin
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody } from "../middleware/validate.ts";
import type { AnnouncementService } from "../services/notifications/announcement.service.ts";
import type { NotificationService } from "../services/notifications/notification.service.ts";
import { ok } from "../utils/respond.ts";
import type { AnnouncementInput, MarkReadInput } from "../validation/notifications.schema.ts";

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Authentication required.");
  return userId;
}

export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly announcements: AnnouncementService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.notifications.list(requireUser(req)));
  };

  unread = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.notifications.unread(requireUser(req)));
  };

  markRead = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<MarkReadInput>(req);
    ok(res, await this.notifications.markRead(requireUser(req), body.ids));
  };

  announcement = async (_req: Request, res: Response): Promise<void> => {
    ok(res, { announcement: await this.announcements.current() });
  };

  setAnnouncement = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<AnnouncementInput>(req);
    ok(res, { announcement: await this.announcements.set(requireUser(req), body) });
  };
}
