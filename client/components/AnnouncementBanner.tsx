"use client";

/** The admin-set, site-wide announcement. Dismissing hides that announcement only. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

interface Announcement {
  id: string;
  message: string;
  level: "info" | "success" | "warning";
  link: string;
}

const DISMISSED_KEY = "dwcode_announcement_dismissed";

const TONE: Record<Announcement["level"], string> = {
  info: "bg-primary/10 border-primary/30 text-foreground",
  success: "bg-green-500/10 border-green-500/30 text-foreground",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-foreground",
};

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    apiRequest<{ announcement: Announcement | null }>("/api/v1/announcement")
      .then(({ announcement: a }) => {
        let dismissed: string | null = null;
        try {
          dismissed = localStorage.getItem(DISMISSED_KEY);
        } catch {
          // Storage unavailable: show it.
        }
        if (a && a.id !== dismissed) setAnnouncement(a);
      })
      .catch(() => {});
  }, []);

  if (!announcement) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, announcement.id);
    } catch {
      // Storage unavailable: hide it for this page view only.
    }
    setAnnouncement(null);
  };

  return (
    <div className={`border-b ${TONE[announcement.level]}`}>
      <div className="container mx-auto px-4 py-2 flex items-center gap-2 text-sm">
        <Megaphone className="w-4 h-4 shrink-0 text-primary" />
        <p className="flex-1">
          {announcement.message}
          {announcement.link && (
            <Link href={announcement.link} className="ml-2 font-medium text-primary hover:underline">
              Learn more →
            </Link>
          )}
        </p>
        <button type="button" onClick={dismiss} aria-label="Dismiss announcement" className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
