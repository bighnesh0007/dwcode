"use client";

/** Streak, streak freezes and achievements for the signed-in user. */
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Award, Calendar, Code2, Compass, Flame, Mountain, Shuffle, Snowflake, Sparkles, Swords, Trophy, type LucideIcon,
} from "lucide-react";
import type { Achievement, StreakView } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProgressView {
  streak: StreakView;
  freezesOwned: number;
  dailyChallengesDone: number;
  achievements: Achievement[];
}

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, code: Code2, shuffle: Shuffle, trophy: Trophy, mountain: Mountain,
  compass: Compass, calendar: Calendar, flame: Flame, swords: Swords,
};

export function ProgressPanel() {
  const [progress, setProgress] = useState<ProgressView | null>(null);

  useEffect(() => {
    apiRequest<ProgressView>("/api/v1/engagement/me").then(setProgress).catch(() => {});
  }, []);

  if (!progress) return null;
  const earned = progress.achievements.filter((a) => a.earned).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" /> Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Stat icon={<Flame className="w-4 h-4 text-orange-500" />} label="Current streak" value={`${progress.streak.current}d`} />
          <Stat icon={<Trophy className="w-4 h-4 text-yellow-500" />} label="Longest streak" value={`${progress.streak.longest}d`} />
          <Stat
            icon={<Snowflake className="w-4 h-4 text-cyan-500" />}
            label="Freezes"
            value={`${progress.freezesOwned - progress.streak.freezesUsed}/${progress.freezesOwned}`}
          />
          <Stat icon={<Calendar className="w-4 h-4 text-primary" />} label="Daily challenges" value={String(progress.dailyChallengesDone)} />
        </div>
        {progress.freezesOwned === 0 && (
          <p className="text-xs text-muted-foreground">
            A <Link href="/store" className="text-primary hover:underline">streak freeze</Link> keeps your streak alive through a missed day.
          </p>
        )}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Achievements · {earned}/{progress.achievements.length}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {progress.achievements.map((a) => {
              const Icon = ICONS[a.icon] ?? Award;
              const pct = Math.round((a.progress.current / a.progress.target) * 100);
              return (
                <div key={a.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${a.earned ? "border-primary/40 bg-primary/5" : "opacity-70"}`}>
                  <Icon className={`w-5 h-5 shrink-0 ${a.earned ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                    {!a.earned && (
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden" aria-label={`${pct}% complete`}>
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  {!a.earned && <span className="text-[11px] text-muted-foreground tabular-nums">{a.progress.current}/{a.progress.target}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="flex justify-center">{icon}</div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
