"use client";

/**
 * Signed-in home dashboard (Phase F): the next contest with a live
 * countdown, where you are on the rank ladder and what the next rank needs,
 * and a short FAQ.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { RANK_TIERS, getTier } from "@/lib/ranks";
import type { ContestListItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

function NextContest() {
  const [contest, setContest] = useState<ContestListItem | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    apiRequest<ContestListItem[]>("/api/v1/contests")
      .then((list) => {
        const t = Date.now();
        const live = list.find((c) => Date.parse(c.startTime) <= t && Date.parse(c.endTime) > t);
        const next = list.filter((c) => Date.parse(c.startTime) > t).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0];
        setContest(live ?? next ?? null);
      })
      .catch(() => setContest(null));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (contest === undefined) return null;
  const live = contest && Date.parse(contest.startTime) <= now;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" /> {live ? "Contest live now" : "Next contest"}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!contest ? (
          <p className="text-sm text-muted-foreground">No contest scheduled. <Link href="/contests" className="underline">See past contests</Link></p>
        ) : (
          <>
            <p className="font-medium">{contest.title}</p>
            <p className="text-2xl font-mono font-bold" aria-live="off">
              {live ? `ends in ${countdown(Date.parse(contest.endTime) - now)}` : countdown(Date.parse(contest.startTime) - now)}
            </p>
            <Link href={`/contests/${contest._id}`} className="text-sm text-primary underline">{live ? "Join now" : "Details"}</Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RankLadder({ score }: { score: number }) {
  const current = getTier(score);
  const ascending = [...RANK_TIERS].sort((a, b) => a.min - b.min);
  const next = ascending.find((t) => t.min > score);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Rank ladder</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ol className="flex items-end gap-1" aria-label="Ranks, lowest to highest">
          {ascending.map((t) => (
            <li key={t.id} className={cn("flex-1 rounded border px-1 py-1.5 text-center text-[10px] leading-tight", t.bg, t.id === current.id && "ring-2 ring-primary")}
              aria-current={t.id === current.id ? "step" : undefined} title={`${t.label}: ${t.min}+ points`}>
              <span className="block text-base" aria-hidden>{t.icon}</span>
              <span className={t.color}>{t.label}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm">
          You&apos;re <strong className={current.color}>{current.label}</strong> with {score} points.
          {next ? <> {next.min - score} more for <strong className={next.color}>{next.label}</strong>.</> : " That's the top rank."}
        </p>
      </CardContent>
    </Card>
  );
}

const FAQ = [
  { q: "How are points counted?", a: "Each problem you solve adds points by its difficulty, harder problems more. Points set your rank. Coins are separate: you spend them in the store." },
  { q: "Why did my correct-looking answer fail?", a: "Output is compared as JSON, including the hidden test cases. Check types (\"1\" is not 1), nulls and key order in arrays. Ask the AI to explain a compiler error from the workspace." },
  { q: "What's a streak freeze?", a: "Bought in the store, each one bridges a single missed day so your streak doesn't reset." },
  { q: "How do contests work?", a: "Contests run on a regular schedule (see Contests). Standings rank by points, then penalty time, and results move your contest rating." },
  { q: "Can I add problems?", a: "Yes. Use Contribute: write a problem, run the automatic check, then submit it for review." },
];

function Faq() {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">FAQ</CardTitle></CardHeader>
      <CardContent className="divide-y">
        {FAQ.map((f) => (
          <details key={f.q} className="group py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              {f.q}<ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

export function HomeDashboard({ score }: { score: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <NextContest />
      <RankLadder score={score} />
      <Faq />
    </div>
  );
}
