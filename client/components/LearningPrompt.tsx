"use client";

/** Home-page nudge: until onboarding is done, point signed-in learners to /welcome; afterwards, to their roadmap. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Compass, Map as MapIcon } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import type { LearnerMe } from "@/lib/learningPaths";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function LearningPrompt() {
  const { isSignedIn } = useAuth();
  const [me, setMe] = useState<LearnerMe | null>(null);

  useEffect(() => {
    if (isSignedIn) apiRequest<LearnerMe>("/api/v1/learning/me").then(setMe).catch(() => {});
  }, [isSignedIn]);

  if (!me) return null;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        {me.needsOnboarding ? (
          <>
            <p className="text-sm flex items-center gap-2"><Compass className="w-4 h-4 text-primary" /> Tell us your goal and we&apos;ll build a roadmap and weekly plan for you.</p>
            <Link href="/welcome"><Button size="sm">Set up my path</Button></Link>
          </>
        ) : (
          <>
            <p className="text-sm flex items-center gap-2"><MapIcon className="w-4 h-4 text-primary" /> Pick up where you left off on your roadmap.</p>
            <Link href={me.roadmapId ? `/roadmap/${me.roadmapId}` : "/roadmap"}><Button size="sm" variant="outline">Continue</Button></Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
