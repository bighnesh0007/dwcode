"use client";

/** Today's daily challenge: the problem, the bonus, a countdown, and whether you've solved it. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, Coins } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DailyView {
  day: string;
  resetsAt: string;
  bonus: number;
  solved?: boolean;
  problem: { slug: string; title: string; difficulty: string; category: string } | null;
}

function remaining(resetsAt: string, now: number): string {
  const ms = Math.max(0, Date.parse(resetsAt) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function DailyCard({ className = "" }: { className?: string }) {
  const [daily, setDaily] = useState<DailyView | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    apiRequest<DailyView>("/api/v1/daily").then(setDaily).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!daily?.problem) return null;

  return (
    <Card className={`border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card ${className}`}>
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" /> Daily challenge
          </p>
          <Link href={`/problems/${daily.problem.slug}`} className="mt-1 block text-base font-semibold hover:text-primary truncate">
            {daily.problem.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">{daily.problem.difficulty}</Badge>
            <span>{daily.problem.category}</span>
            <span>· New one in {remaining(daily.resetsAt, now)}</span>
          </div>
        </div>
        {daily.solved ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-500">
            <CalendarCheck className="w-4 h-4" /> Solved today
          </span>
        ) : (
          <Link
            href={`/problems/${daily.problem.slug}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Solve for <Coins className="w-3.5 h-3.5" /> +{daily.bonus}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
