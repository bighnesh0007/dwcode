import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { GuestMigration } from "@/components/GuestMigration";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { serverApi } from "@/lib/serverApi";
import { Heatmap, ProgressRing } from "@/components/Charts";
import { Code2, Zap, Trophy, Star, BarChart2, Flame, TrendingUp } from "lucide-react";
import type { ProblemSummary } from "@/lib/types";

export default async function Home() {
  const { userId } = await auth();

  let total = 0, easy = 0, medium = 0, hard = 0;
  let solved = 0, attempted = 0, bookmarked = 0;
  let totalSubmissions = 0, acceptanceRate = 0, streak = 0;
  let solvedEasy = 0, solvedMedium = 0, solvedHard = 0;
  let recentProblems: ProblemSummary[] = [];
  let bookmarkedProblems: ProblemSummary[] = [];
  const activityData: { date: string; count: number }[] = [];

  try {
    const stats = await serverApi<{ total: number; byDifficulty: Record<string, number> }>("/api/v1/problems/stats");
    total = stats.total;
    easy = stats.byDifficulty.Easy ?? 0;
    medium = stats.byDifficulty.Medium ?? 0;
    hard = stats.byDifficulty.Hard ?? 0;

    if (userId) {
      const [mine, bookmarks] = await Promise.all([
        serverApi<{ total: number; accepted: number; solved: string[]; attempted: string[]; daily: Record<string, number> }>(
          "/api/v1/submissions/stats",
        ),
        serverApi<{ problemId: string }[]>("/api/v1/bookmarks"),
      ]);

      // Solved = any problem that has an Accepted submission
      solved = mine.solved.length;
      attempted = mine.attempted.length;
      totalSubmissions = mine.total;
      acceptanceRate = totalSubmissions > 0 ? Math.round((mine.accepted / totalSubmissions) * 100) : 0;

      bookmarked = bookmarks.length;
      if (bookmarked > 0) {
        bookmarkedProblems = await serverApi<ProblemSummary[]>("/api/v1/problems/summaries", {
          method: "POST",
          body: { ids: bookmarks.map((b) => b.problemId), limit: 3 },
        });
      }

      const solvedProbs = mine.solved.length
        ? await serverApi<ProblemSummary[]>("/api/v1/problems/summaries", {
            method: "POST",
            body: { slugs: mine.solved },
          })
        : [];
      solvedEasy = solvedProbs.filter((problem) => problem.difficulty === "Easy").length;
      solvedMedium = solvedProbs.filter((problem) => problem.difficulty === "Medium").length;
      solvedHard = solvedProbs.filter((problem) => problem.difficulty === "Hard").length;

      const activityMap = mine.daily;
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        activityData.push({ date: key, count: activityMap[key] ?? 0 });
      }

      // Over the full year of daily counts — it used to be computed from the
      // last 30 days only, so a streak could never show more than 30.
      const todayStr = new Date().toISOString().split("T")[0];
      for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        if (activityMap[key] || (i === 0 && activityMap[todayStr])) streak++;
        else if (i > 0) break;
      }

      recentProblems = await serverApi<ProblemSummary[]>("/api/v1/problems/mine?limit=4");
    }

  } catch (e) {
    console.error("Dashboard data error:", e);
  }

  const difficultyColor = (d: string) =>
    d === "Easy" ? "text-green-500 border-green-500/30 bg-green-500/10" :
    d === "Medium" ? "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" :
    "text-red-500 border-red-500/30 bg-red-500/10";

  const solvedPct = total > 0 ? Math.round((solved / total) * 100) : 0;

  return (
    <div className="container max-w-screen-xl mx-auto py-10 px-4 space-y-8">
      {userId && <GuestMigration userId={userId} />}
      {/* Hero */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Code2 className="w-6 h-6 text-primary" />
            <span className="text-sm font-medium text-primary uppercase tracking-widest">DWCode</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Your personal DataWeave practice space.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/problems" className={cn(buttonVariants({ size: "sm" }))}>
            View All Problems
          </Link>
          <Link href="/create" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
            + Add Problem
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4 text-green-500" /> Solved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{solved}</div>
            <div className="mt-2">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${solvedPct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{solvedPct}% of total</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" /> Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">{totalSubmissions}</div>
            <p className="text-xs text-muted-foreground mt-2">{acceptanceRate}% acceptance rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" /> Current Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{streak}</div>
            <p className="text-xs text-muted-foreground mt-2">{streak === 1 ? "day" : "days"} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" /> Attempted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-500">{attempted}</div>
            <p className="text-xs text-muted-foreground mt-2">in progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" /> Bookmarked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-400">{bookmarked}</div>
            <p className="text-xs text-muted-foreground mt-2">saved for revision</p>
          </CardContent>
        </Card>
      </div>

      {userId && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Solve breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart2 className="w-4 h-4 text-primary" /> Solve Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-around gap-4 py-2">
                {[
                  { label: "Easy", value: solvedEasy, total: easy, color: "text-green-500" },
                  { label: "Medium", value: solvedMedium, total: medium, color: "text-yellow-500" },
                  { label: "Hard", value: solvedHard, total: hard, color: "text-red-500" },
                ].map(({ label, value, total, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div className="relative">
                      <ProgressRing value={value} max={total} color={color} size={72} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-sm font-bold ${color}`}>{value}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-[10px] text-muted-foreground/60">{value}/{total}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Activity heatmap */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="w-4 h-4 text-primary" /> Activity — Last 30 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Heatmap data={activityData} />
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <span>Total this month: <span className="font-semibold text-foreground">{activityData.reduce((a, d) => a + d.count, 0)}</span> submissions</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Problems */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              Recent Problems
            </CardTitle>
            <CardDescription>Your most recently added problems.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentProblems.length > 0 ? recentProblems.map((p) => (
              <div key={p._id} className="flex items-center justify-between gap-2 group">
                <Link
                  href={`/problems/${p.slug}`}
                  className="text-sm font-medium hover:text-primary transition-colors truncate"
                >
                  {p.title}
                </Link>
                <Badge variant="outline" className={`text-xs flex-shrink-0 ${difficultyColor(p.difficulty)}`}>
                  {p.difficulty}
                </Badge>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground italic">No problems yet.</p>
            )}
            {recentProblems.length > 0 && (
              <Link href="/problems" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Bookmarked */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              Bookmarked for Revision
            </CardTitle>
            <CardDescription>Problems you&apos;ve starred to revisit.</CardDescription>
          </CardHeader>
          <CardContent>
            {bookmarkedProblems.length > 0 ? (
              <div className="space-y-3">
                {bookmarkedProblems.map((p) => (
                  <div key={p._id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/problems/${p.slug}`}
                      className="text-sm font-medium hover:text-primary transition-colors truncate"
                    >
                      {p.title}
                    </Link>
                    <Badge variant="outline" className={`text-xs flex-shrink-0 ${difficultyColor(p.difficulty)}`}>
                      {p.difficulty}
                    </Badge>
                  </div>
                ))}
                {bookmarked > 3 && (
                  <Link href="/problems?filter=bookmarked" className="text-xs text-primary hover:underline">
                    +{bookmarked - 3} more →
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center space-y-2">
                <Star className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No bookmarks yet. Open any problem and click ⭐ to bookmark it.
                </p>
                <Link href="/problems" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-2")}>
                  Browse Problems
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
