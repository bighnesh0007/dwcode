"use client";

import { useEffect } from "react";
import { apiRequest } from "@/lib/apiClient";

export function GuestMigration({ userId }: { userId: string }) {
  useEffect(() => {
    if (!userId) return;

    try {
      const raw = localStorage.getItem("dwcode_guest_progress");
      if (!raw) return;

      const slugs = JSON.parse(raw);
      if (!Array.isArray(slugs) || slugs.length === 0) {
        localStorage.removeItem("dwcode_guest_progress");
        return;
      }

      // Disabled server-side (503 NOT_CONFIGURED) until guest solves can be
      // re-graded; a failure keeps localStorage so the carryover resumes later.
      apiRequest<{ migrated: number }>("/api/v1/guest-progress", {
        method: "POST",
        body: { slugs },
      })
        .then(() => {
          localStorage.removeItem("dwcode_guest_progress");
        })
        .catch(() => {
          // Leave localStorage intact for next attempt
        });
    } catch {
      // JSON parse error or localStorage unavailable
      localStorage.removeItem("dwcode_guest_progress");
    }
  }, [userId]);

  return null;
}
