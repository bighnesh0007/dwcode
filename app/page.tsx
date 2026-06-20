import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";
import { Submission } from "@/models/Submission";
import { Bookmark } from "@/models/Bookmark";
import { Code2, Zap, Trophy, BookOpen, Star, Shuffle, BarChart2 } from "lucide-react";

export default async function Home() {
  let total = 0, easy = 0, medium = 0, hard = 0;
  let solved = 0, attempted = 0, bookmarked = 0;
  let recentProblems: any[] = [];
  let bookmarkedProblems: any[] = [];

  try {
    await connectToDatabase();
    [total, easy, medium, hard] = await Promise.all([
      Problem.countDocuments(),
      Problem.countDocuments({ difficulty: "Easy" }),
      Problem.countDocuments({ difficulty: "Medium" }),
      Problem.countDocuments({ difficulty: "Hard" }),
    ]);

    // Solved = any problem that has an Accepted submission
    const acceptedSlugs = await Submission.distinct("problemSlug", { status: "Accepted" });
    const attemptedSlugs = await Submission.distinct("problemSlug", { status: { $ne: "Accepted" } });
    solved = acceptedSlugs.length;
    attempted = attemptedSlugs.filter((s: string) => !acceptedSlugs.includes(s)).length;

    bookmarked = await Bookmark.countDocuments();

    const recentDocs = await Problem.find().sort({ createdAt: -1 }).limit(4).lean();
    recentProblems = JSON.parse(JSON.stringify(recentDocs));

    if (bookmarked > 0) {
      const bmarks = await Bookmark.find().lean();
      const bIds = bmarks.map((b: any) => b.problemId);
      const bDocs = await Problem.find({ _id: { $in: bIds } }).limit(3).lean();
      bookmarkedProblems = JSON.parse(JSON.stringify(bDocs));
    }
  } catch (e) {
    console.error("Dashboard DB error:", e);
  }

  const difficultyColor = (d: string) =>
    d === "Easy" ? "text-green-500 border-green-500/30 bg-green-500/10" :
    d === "Medium" ? "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" :
    "text-red-500 border-red-500/30 bg-red-500/10";

  const solvedPct = total > 0 ? Math.round((solved / total) * 100) : 0;

  return (
    <div className="container max-w-screen-xl mx-auto py-10 px-4 space-y-8">
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Total Problems
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{total}</div>
            <div className="flex gap-2 mt-2">
              <span className="text-xs text-green-500">{easy} Easy</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-yellow-500">{medium} Medium</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-red-500">{hard} Hard</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Solved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{solved}</div>
            <div className="mt-2">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${solvedPct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{solvedPct}% solved</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="w-4 h-4" /> Attempted
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
              <Star className="w-4 h-4" /> Bookmarked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-400">{bookmarked}</div>
            <p className="text-xs text-muted-foreground mt-2">saved for revision</p>
          </CardContent>
        </Card>
      </div>

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
            <CardDescription>Problems you've starred to revisit.</CardDescription>
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
