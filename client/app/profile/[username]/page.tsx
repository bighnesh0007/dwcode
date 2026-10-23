import Link from "next/link";
import { notFound } from "next/navigation";
import { serverApiOrNull } from "@/lib/serverApi";
import { Heatmap, ProgressRing } from "@/components/Charts";
import RankAvatar from "@/components/RankAvatar";
import { getTier } from "@/lib/ranks";
import { DIFFICULTY_TIERS } from "@dwcode/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Trophy, Code2, Zap, TrendingUp, BarChart2, Flame,
  CalendarDays, Users, Clock,
} from "lucide-react";
import FollowButton from "./FollowButton";

/** GET /api/v1/profile/u/:username — public fields only. */
interface PublicProfile {
  username: string;
  bio: string;
  followers: number;
  following: number;
  joinedAt: string;
  imageUrl: string;
  isOwnProfile: boolean;
  isFollowing: boolean;
  score: number;
  solved: { total: number; byDifficulty: Record<string, number> };
  problemsByDifficulty: Record<string, number>;
  attempted: number;
  totalSubmissions: number;
  acceptanceRate: number;
  streak: number;
  activityData: { date: string; count: number }[];
  recentLog: { problemSlug: string; status: string; executionTime: string; createdAt: string }[];
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function statusColor(status: string): string {
  if (status === "Accepted") return "text-green-500";
  if (status === "Error") return "text-red-500";
  return "text-yellow-500";
}

function statusDotColor(status: string): string {
  if (status === "Accepted") return "bg-green-500";
  if (status === "Error") return "bg-red-500";
  return "bg-yellow-500";
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  // The visitor's session is forwarded, so isOwnProfile / isFollowing are theirs.
  const profile = await serverApiOrNull<PublicProfile>(`/api/v1/profile/u/${encodeURIComponent(username)}`);
  if (!profile) notFound();

  const {
    score, attempted, acceptanceRate, totalSubmissions, streak, activityData, recentLog, imageUrl,
    isOwnProfile, isFollowing: initialIsFollowing,
  } = profile;
  const tier = getTier(score);
  const solvedTotal = profile.solved.total;
  // One ring per tier in the shared registry — never a hardcoded difficulty list.
  const breakdown = DIFFICULTY_TIERS.map((t) => ({
    label: t.label,
    value: profile.solved.byDifficulty[t.id] ?? 0,
    total: profile.problemsByDifficulty[t.id] ?? 0,
    color: t.className.text,
  }));
  const joinedAt = new Date(profile.joinedAt).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const statCards = [
    {
      icon: <Trophy className="w-4 h-4" />,
      label: "Score",
      value: score,
      sub: `${tier.icon} ${tier.label} tier`,
      color: tier.color,
    },
    {
      icon: <Code2 className="w-4 h-4" />,
      label: "Solved",
      value: solvedTotal,
      sub: `${attempted} attempted, unsolved`,
      color: "text-green-500",
    },
    {
      icon: <Zap className="w-4 h-4" />,
      label: "Acceptance Rate",
      value: `${acceptanceRate}%`,
      sub: `${totalSubmissions} total submissions`,
      color: "text-blue-500",
    },
    {
      icon: <Flame className="w-4 h-4" />,
      label: "Current Streak",
      value: streak,
      sub: streak === 1 ? "day active" : "days active",
      color: "text-orange-500",
    },
  ];

  return (
    <div className="container max-w-screen-xl mx-auto py-10 px-4 space-y-8">

      {/* ── Hero ── */}
      <Card className="overflow-hidden pt-0">
        <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
        <CardContent className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5 -mt-14">
            <RankAvatar
              name={`@${profile.username}`}
              imageUrl={imageUrl || undefined}
              tierId={tier.id}
              size={96}
              showTierBadge
            />
            <div className="flex-1 min-w-0 sm:pb-1">
              <h1 className="text-2xl font-bold tracking-tight truncate">@{profile.username}</h1>
              <p className="text-muted-foreground text-sm mt-1 max-w-xl">
                {profile.bio || "No bio provided."}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground">{profile.followers}</span> Followers
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-foreground">{profile.following}</span> Following
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Joined {joinedAt}
                </span>
              </div>
            </div>
            <div className="sm:pb-1 flex-shrink-0">
              {isOwnProfile ? (
                <Link href="/profile" className="text-xs text-primary hover:underline">
                  This is you — edit on your profile →
                </Link>
              ) : (
                <FollowButton targetUsername={profile.username} initialFollowing={initialIsFollowing} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className={stat.color}>{stat.icon}</span> {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Solve breakdown + Activity heatmap ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart2 className="w-4 h-4 text-primary" /> Solve Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {solvedTotal === 0 ? (
              <div className="flex flex-col items-center py-8 text-center gap-2">
                <Trophy className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No problems solved yet.</p>
              </div>
            ) : (
              <div className="flex items-center justify-around gap-4 py-2">
                {breakdown.map(({ label, value, total, color }) => (
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" /> Activity — Last 30 Days
            </CardTitle>
            <CardDescription className="text-xs">Each cell = one day. Darker = more submissions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Heatmap data={activityData} />
            <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
              <span>
                Total this month:{" "}
                <span className="font-semibold text-foreground">
                  {activityData.reduce((a, d) => a + d.count, 0)}
                </span>{" "}
                submissions
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Recent submissions ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-primary" /> Recent Submissions
          </CardTitle>
          <CardDescription className="text-xs">Last 10 submissions</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLog.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center gap-2">
              <Code2 className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                @{profile.username} hasn&apos;t submitted anything yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLog.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColor(entry.status)}`} />
                    <Link
                      href={`/problems/${entry.problemSlug}`}
                      className="text-sm font-medium hover:text-primary transition-colors truncate"
                    >
                      {entry.problemSlug}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                    <span className="font-mono hidden sm:inline">{entry.executionTime}</span>
                    <span>{timeAgo(new Date(entry.createdAt))}</span>
                    <span className={`font-semibold ${statusColor(entry.status)}`}>{entry.status}</span>
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
