"use client";

/** Jobs board: DataWeave and MuleSoft roles, posted by the community and approved by an admin. */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, ExternalLink, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { safeHref } from "@/lib/profileExtras";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  description: string;
  tags: string[];
  postedAt: string;
}

export default function JobsPage() {
  const [data, setData] = useState<{ jobs: Job[]; listingDays: number } | null>(null);
  const [remoteOnly, setRemoteOnly] = useState(false);

  useEffect(() => {
    apiRequest<{ jobs: Job[]; listingDays: number }>("/api/v1/jobs").then(setData).catch(() => setData({ jobs: [], listingDays: 60 }));
  }, []);
  const jobs = useMemo(() => (data?.jobs ?? []).filter((j) => !remoteOnly || j.remote), [data, remoteOnly]);

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Briefcase className="w-6 h-6 text-primary" /> Jobs</h1>
          <p className="text-muted-foreground">DataWeave and MuleSoft roles. Posts stay up for {data?.listingDays ?? 60} days.</p>
        </div>
        <Link href="/jobs/new"><Button variant="outline">Post a job</Button></Link>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} /> Remote only</label>
      {!data ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : jobs.length === 0 ? <p className="text-muted-foreground">No openings right now.</p> : (
        <div className="space-y-4">
          {jobs.map((j) => {
            const href = safeHref(j.url);
            return (
              <Card key={j.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{j.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{j.company} · {j.location}{j.remote ? " · Remote" : ""} · posted {new Date(j.postedAt).toLocaleDateString()}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm whitespace-pre-wrap line-clamp-6">{j.description}</p>
                  {j.tags.length > 0 && <div className="flex flex-wrap gap-1">{j.tags.map((t) => <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">{t}</span>)}</div>}
                  {href && <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Apply <ExternalLink className="w-3 h-3" /></a>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
