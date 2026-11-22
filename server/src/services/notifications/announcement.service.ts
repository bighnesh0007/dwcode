/**
 * The site-wide announcement banner, set by admins. Stored as one setting;
 * an expired or empty announcement reads as none.
 */
import type { SettingsRepository } from "../../repositories/notification.repository.ts";
import type { Clock } from "../../types/ports.ts";

const KEY = "announcement";

export const ANNOUNCEMENT_LEVELS = ["info", "success", "warning"] as const;
export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number];

export interface Announcement {
  message: string;
  level: AnnouncementLevel;
  /** Site-relative link, or empty. */
  link: string;
  /** ISO time after which it stops showing, or null for no expiry. */
  expiresAt: string | null;
  /** Changes with every save, so a dismissal applies to one announcement only. */
  id: string;
}

export class AnnouncementService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly clock: Clock,
  ) {}

  async current(): Promise<Announcement | null> {
    const value = (await this.settings.get(KEY)) as Announcement | null;
    if (!value?.message) return null;
    if (value.expiresAt && Date.parse(value.expiresAt) <= this.clock.nowMs()) return null;
    return value;
  }

  /** An empty message clears the banner. */
  async set(
    adminId: string,
    input: { message: string; level: AnnouncementLevel; link?: string | undefined; expiresAt?: string | null | undefined },
  ): Promise<Announcement | null> {
    const message = input.message.trim();
    if (!message) {
      await this.settings.set(KEY, null, adminId);
      return null;
    }
    const link = input.link?.startsWith("/") && !input.link.startsWith("//") ? input.link : "";
    const value: Announcement = {
      message,
      level: input.level,
      link,
      expiresAt: input.expiresAt ?? null,
      id: String(this.clock.nowMs()),
    };
    await this.settings.set(KEY, value, adminId);
    return value;
  }
}
