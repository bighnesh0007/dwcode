import Link from "next/link";
import { notFound } from "next/navigation";
import connectToDatabase from "@/lib/db";
import { UserProfile } from "@/models/UserProfile";
import { Problem } from "@/models/Problem";
import { Submission } from "@/models/Submission";
import { Heatmap, ProgressRing } from "@/components/Charts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, Code2, Zap, TrendingUp, BarChart2, Star } from "lucide-react";
import FollowButton from "./FollowButton";

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  await connectToDatabase();

  const user = await UserProfile.findOne({ username: params.username }).lean();
  if (!user) return notFound();

  const userId = user.userId;

  // Compute stats
  const allSubmissions = await Submission.find({ userId }).sort({ createdAt: -1 }).lean();
  const totalSubmissions = allSubmissions.length;
  const acceptedSlugs = new Set(allSubmissions.filter((submission) => submission.status === "Accepted").map((submission) => submission.problemSlug));
  const acceptedCount = acceptedSlugs.size;
  const acceptanceRate = totalSubmissions > 0 ? Math.round((allSubmissions.filter((submission) => submission.status === "Accepted").length / totalSubmissions) * 100) : 0;

  const solvedProbs = await Problem.find({ slug: { $in: Array.from(acceptedSlugs) } }).select("difficulty").lean();
  const solvedEasy = solvedProbs.filter((problem) => problem.difficulty === "Easy").length;
  const solvedMedium = solvedProbs.filter((problem) => problem.difficulty === "Medium").length;
  const solvedHard = solvedProbs.filter((problem) => problem.difficulty === "Hard").length;

  const [easy, medium, hard] = await Promise.all([
    Problem.countDocuments({ difficulty: "Easy" }),
    Problem.countDocuments({ difficulty: "Medium" }),
    Problem.countDocuments({ difficulty: "Hard" }),
  ]);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSubs = allSubmissions.filter((submission) => new Date(submission.createdAt) >= thirtyDaysAgo);
  const activityMap: Record<string, number> = {};
  for (const sub of recentSubs) {
    const day = new Date(sub.createdAt).toISOString().split("T")[0];
    activityMap[day] = (activityMap[day] ?? 0) + 1;
  }
  const activityData: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    activityData.push({ date: key, count: activityMap[key] ?? 0 });
  }

  const recentLog = allSubmissions.slice(0, 10);

  return (
    <div className="container max-w-screen-xl mx-auto py-10 px-4 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Code2 className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">@{user.username}</h1>
            <p className="text-muted-foreground text-sm mt-0.5 max-w-lg">{user.bio || "No bio provided."}</p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs font-semibold">{user.followers.length} Followers</span>
              <span className="text-xs font-semibold">{user.following.length} Following</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
            <FollowButton targetUsername={user.username} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4 text-green-500" /> Solved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{acceptedCount}</div>
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
              <Star className="w-4 h-4 text-yellow-500" /> Member Since
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-yellow-500">{new Date(user.createdAt).toLocaleDateString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Recent Activity
          </CardTitle>
          <CardDescription className="text-xs">Last 10 submissions</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLog.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No submissions yet.</p>
          ) : (
            <div className="space-y-2">
              {recentLog.map((entry, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/problems/${entry.problemSlug}`} className="text-sm font-medium hover:text-primary transition-colors truncate">
                      {entry.problemSlug}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                    <span className="font-mono">{entry.executionTime}</span>
                    <span className={`font-semibold ${entry.status === "Accepted" ? "text-green-500" : entry.status === "Error" ? "text-red-500" : "text-yellow-500"}`}>
                      {entry.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
