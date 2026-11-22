"use client";

/** Roadmaps: guided paths of lessons, quizzes and problems. Signed-in learners see which one is theirs. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, Compass, GraduationCap, Map as MapIcon } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import type { LearnerMe } from "@/lib/learningPaths";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RoadmapSummary {
  id: string;
  title: string;
  summary: string;
  steps: number;
}

export default function RoadmapsPage() {
  const { isSignedIn } = useAuth();
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null>(null);
  const [me, setMe] = useState<LearnerMe | null>(null);

  useEffect(() => {
    apiRequest<{ roadmaps: RoadmapSummary[] }>("/api/v1/learning/roadmaps").then((d) => setRoadmaps(d.roadmaps)).catch(() => setRoadmaps([]));
  }, []);
  useEffect(() => {
    if (isSignedIn) apiRequest<LearnerMe>("/api/v1/learning/me").then(setMe).catch(() => {});
  }, [isSignedIn]);

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapIcon className="w-6 h-6 text-primary" /> Roadmaps</h1>
          <p className="text-muted-foreground">Short lessons, a quiz per step, and problems to prove you&apos;ve got it.</p>
        </div>
        <Link href="/certification"><Button variant="outline"><GraduationCap className="w-4 h-4 mr-2" /> MuleSoft certification prep</Button></Link>
      </div>

      {me?.needsOnboarding && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm flex items-center gap-2"><Compass className="w-4 h-4 text-primary" /> Answer four questions and we&apos;ll pick a roadmap and a weekly plan for you.</p>
            <Link href="/welcome"><Button size="sm">Get started</Button></Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(roadmaps ?? []).map((r) => (
          <Link key={r.id} href={`/roadmap/${r.id}`} className="group">
            <Card className={me?.roadmapId === r.id ? "h-full border-primary" : "h-full group-hover:border-primary/50 transition-colors"}>
              <CardHeader className="pb-2">
                {me?.roadmapId === r.id && <span className="text-xs font-semibold text-primary">Your roadmap</span>}
                <CardTitle className="text-lg">{r.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{r.summary}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">{r.steps} steps <ArrowRight className="w-3 h-3" /></p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
