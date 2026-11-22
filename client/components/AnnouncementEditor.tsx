"use client";

/** Admin: set or clear the site-wide announcement banner. */
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Level = "info" | "success" | "warning";

interface Announcement {
  message: string;
  level: Level;
  link: string;
  expiresAt: string | null;
}

export function AnnouncementEditor() {
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState<Level>("info");
  const [link, setLink] = useState("");
  const [expires, setExpires] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest<{ announcement: Announcement | null }>("/api/v1/announcement")
      .then(({ announcement: a }) => {
        if (!a) return;
        setMessage(a.message);
        setLevel(a.level);
        setLink(a.link);
        setExpires(a.expiresAt ? a.expiresAt.slice(0, 16) : "");
      })
      .catch(() => {});
  }, []);

  const save = async (clear = false) => {
    setBusy(true);
    setStatus(null);
    try {
      await apiRequest("/api/v1/announcement", {
        method: "PUT",
        body: clear
          ? { message: "" }
          : { message, level, link, expiresAt: expires ? new Date(expires).toISOString() : null },
      });
      if (clear) setMessage("");
      setStatus({ ok: true, text: clear ? "Announcement cleared." : "Announcement published." });
    } catch (e) {
      setStatus({ ok: false, text: getErrorMessage(e, "Could not save the announcement.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="w-4 h-4 text-primary" /> Announcement banner
        </CardTitle>
        <CardDescription>Shown at the top of every page until it expires or someone dismisses it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="Weekly contest this Sunday at 20:00 IST" />
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Tone"
          >
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
          </select>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/contests (site path, optional)" />
          <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Expires" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void save()} disabled={busy || !message.trim()}>Publish</Button>
          <Button size="sm" variant="outline" onClick={() => void save(true)} disabled={busy}>Clear</Button>
        </div>
        {status && <p className={`text-sm ${status.ok ? "text-green-500" : "text-red-500"}`}>{status.text}</p>}
      </CardContent>
    </Card>
  );
}
