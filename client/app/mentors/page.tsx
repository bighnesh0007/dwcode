"use client";

/** Mentors: people who offered to help, by topic. Ask from their profile. */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HeartHandshake, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Mentor {
  username: string;
  headline: string;
  topics: string[];
  note: string;
}

export default function MentorsPage() {
  const [mentors, setMentors] = useState<Mentor[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    apiRequest<{ mentors: Mentor[] }>("/api/v1/mentors").then((d) => setMentors(d.mentors)).catch(() => setMentors([]));
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (mentors ?? []).filter((m) => !needle || m.topics.some((t) => t.toLowerCase().includes(needle)) || m.username.toLowerCase().includes(needle));
  }, [mentors, q]);

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HeartHandshake className="w-6 h-6 text-primary" /> Mentors</h1>
        <p className="text-muted-foreground">Experienced DataWeave and MuleSoft developers who offered to help. Want to help too? Turn on mentoring from <Link href="/profile" className="underline">your profile</Link>.</p>
      </div>
      <Input aria-label="Filter by topic" placeholder="Filter by topic, e.g. XML" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      {!mentors ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : shown.length === 0 ? <p className="text-muted-foreground">No mentors match yet.</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((m) => (
            <Link key={m.username} href={`/profile/${encodeURIComponent(m.username)}`} className="group">
              <Card className="h-full group-hover:border-primary/50 transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">@{m.username}</CardTitle>
                  {m.headline && <p className="text-sm text-muted-foreground">{m.headline}</p>}
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1">{m.topics.map((t) => <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">{t}</span>)}</div>
                  {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
