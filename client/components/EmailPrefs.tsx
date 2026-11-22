"use client";

/** Which notifications are also emailed to you. Only replies to your own work are on by default. */
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Prefs {
  configured: boolean;
  categories: { id: string; label: string; enabled: boolean }[];
}

export function EmailPrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Prefs>("/api/v1/profile-details/email").then(setPrefs).catch(() => {});
  }, []);
  if (!prefs) return null;

  const toggle = async (id: string, enabled: boolean) => {
    setError(null);
    try {
      setPrefs(await apiRequest<Prefs>("/api/v1/profile-details/email", { method: "PUT", body: { prefs: { [id]: enabled } } }));
    } catch (e) {
      setError(getErrorMessage(e, "Could not save."));
    }
  };

  return (
    <Card id="email">
      <CardHeader className="pb-2"><CardTitle className="text-base">Email notifications</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!prefs.configured && <p className="text-xs text-muted-foreground">Email isn&apos;t set up on this server yet, so nothing will be sent. Your choices are saved for when it is.</p>}
        {prefs.categories.map((c) => (
          <label key={c.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{c.label}</span>
            <input type="checkbox" checked={c.enabled} onChange={(e) => void toggle(c.id, e.target.checked)} />
          </label>
        ))}
        <p className="text-xs text-muted-foreground">You&apos;ll always see everything in the bell. At most 20 emails a day.</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
