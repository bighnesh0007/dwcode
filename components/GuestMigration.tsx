"use client";

import { useEffect } from "react";

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

      fetch("/api/migrate-guest-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error === undefined) {
            localStorage.removeItem("dwcode_guest_progress");
          }
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
