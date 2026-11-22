"use client";

/**
 * The navbar bell: unread count (polled once a minute while the tab is
 * visible), and the newest notifications when opened.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

const POLL_MS = 60_000;

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  const refreshCount = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    apiRequest<{ unread: number }>("/api/v1/notifications/unread")
      .then((d) => setUnread(d.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, POLL_MS);
    document.addEventListener("visibilitychange", refreshCount);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refreshCount);
    };
  }, [refreshCount]);

  const load = () => {
    apiRequest<{ items: NotificationItem[]; unread: number }>("/api/v1/notifications")
      .then((d) => {
        setItems(d.items);
        setUnread(d.unread);
      })
      .catch(() => setItems([]));
  };

  const markAllRead = () => {
    apiRequest<{ unread: number }>("/api/v1/notifications/read", { method: "POST", body: {} })
      .then((d) => {
        setUnread(d.unread);
        setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
      })
      .catch(() => {});
  };

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) load(); }}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} />
        }
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-4 text-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button type="button" onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items === null ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing yet. Solve today&apos;s daily challenge!</p>
          ) : (
            items.map((n) => {
              const inner = (
                <div className={`px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/40 ${n.read ? "" : "bg-primary/5"}`}>
                  <p className="text-sm leading-snug">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">{ago(n.createdAt)}</p>
                </div>
              );
              return n.link ? <Link key={n.id} href={n.link}>{inner}</Link> : <div key={n.id}>{inner}</div>;
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
