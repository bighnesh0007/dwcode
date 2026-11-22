"use client";

/** Your headline, about, links and mentor listing, on your own profile page. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { PROFILE_LIMITS } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { MyDetails } from "@/lib/profileExtras";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LINKS = ["website", "github", "linkedin"] as const;

export function ProfileExtrasEditor() {
  const [d, setD] = useState<MyDetails | null>(null);
  const [topics, setTopics] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<MyDetails>("/api/v1/profile-details/me").then((x) => { setD(x); setTopics(x.mentorTopics.join(", ")); }).catch(() => {});
  }, []);
  if (!d) return null;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError(null);
    setSaved(null);
    try {
      await fn();
      setSaved(label);
    } catch (e) {
      setError(getErrorMessage(e, "Could not save."));
    }
  };

  const saveAbout = () => run("Profile saved.", () => apiRequest("/api/v1/profile-details/me", {
    method: "PUT",
    body: { headline: d.headline, about: d.about, links: Object.fromEntries(LINKS.flatMap((k) => (d.links[k]?.trim() ? [[k, d.links[k]?.trim()]] : []))) },
  }));
  const saveMentor = (active: boolean) => run(active ? "You're listed as a mentor." : "Mentor listing off.", async () => {
    const list = topics.split(",").map((t) => t.trim()).filter(Boolean).slice(0, PROFILE_LIMITS.mentorTopics);
    await apiRequest("/api/v1/profile-details/mentor", { method: "PUT", body: { active, topics: list, note: d.mentorNote } });
    setD({ ...d, mentorActive: active, mentorTopics: list });
  });

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">About you</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="headline">Headline</Label>
          <Input id="headline" maxLength={PROFILE_LIMITS.headline} placeholder="Integration developer at …" value={d.headline} onChange={(e) => setD({ ...d, headline: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="about">About</Label>
          <Textarea id="about" rows={4} maxLength={PROFILE_LIMITS.about} value={d.about} onChange={(e) => setD({ ...d, about: e.target.value })} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {LINKS.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`link-${k}`} className="capitalize">{k}</Label>
              <Input id={`link-${k}`} type="url" placeholder="https://…" value={d.links[k] ?? ""} onChange={(e) => setD({ ...d, links: { ...d.links, [k]: e.target.value } })} />
            </div>
          ))}
        </div>
        <Button size="sm" onClick={() => void saveAbout()}>Save</Button>

        <div className="border-t pt-4 space-y-2">
          <Label htmlFor="topics">Mentoring</Label>
          <p className="text-xs text-muted-foreground">List yourself on <Link href="/mentors" className="underline">/mentors</Link> so learners can ask you for help.</p>
          <Input id="topics" placeholder="Topics, comma-separated: XML, APIkit, error handling" value={topics} onChange={(e) => setTopics(e.target.value)} />
          <Input aria-label="Mentoring note" placeholder="When you're available (optional)" maxLength={500} value={d.mentorNote} onChange={(e) => setD({ ...d, mentorNote: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" variant={d.mentorActive ? "outline" : "default"} onClick={() => void saveMentor(true)}>{d.mentorActive ? "Update listing" : "List me as a mentor"}</Button>
            {d.mentorActive && <Button size="sm" variant="ghost" onClick={() => void saveMentor(false)}>Stop mentoring</Button>}
          </div>
        </div>
        {saved && <p className="text-sm text-green-600 dark:text-green-400">{saved}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
