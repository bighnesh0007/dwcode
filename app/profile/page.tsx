"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Trophy, Zap, Star, BookOpen, BarChart2, Flame,
    CheckCircle2, Code2, Cpu, Target, Award, TrendingUp,
    Medal, Coins, Edit2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { CoinTransaction } from "@/lib/types";
import { getErrorMessage } from "@/lib/errors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
    username?: string;
    bio?: string;
    followers: number;
    following: number;
    githubConnected?: boolean;
    githubUsername?: string;
    problems: { total: number; easy: number; medium: number; hard: number; createdByAI: number; createdManually: number };
    submissions: { total: number; accepted: number; acceptanceRate: number };
    solved: { total: number; easy: number; medium: number; hard: number };
    attempted: number;
    bookmarks: number;
    streak: number;
    activityData: { date: string; count: number }[];
    recentLog: { problemSlug: string; status: string; executionTime: string; createdAt: string }[];
}

interface LeaderboardEntry {
    userId: string;
    score: number;
}

// ─── Badge definitions ────────────────────────────────────────────────────────

interface BadgeDef {
    id: string;
    icon: React.ReactNode;
    label: string;
    description: string;
    color: string;
    earned: (d: ProfileData) => boolean;
    tier?: "bronze" | "silver" | "gold" | "platinum";
}

const BADGE_DEFS: BadgeDef[] = [
    {
        id: "first-solve",
        icon: <CheckCircle2 className="w-5 h-5" />,
        label: "First Blood",
        description: "Solve your first problem",
        color: "text-green-400",
        tier: "bronze",
        earned: (d) => d.solved.total >= 1,
    },
    {
        id: "ten-solved",
        icon: <Trophy className="w-5 h-5" />,
        label: "Problem Solver",
        description: "Solve 10 problems",
        color: "text-yellow-400",
        tier: "silver",
        earned: (d) => d.solved.total >= 10,
    },
    {
        id: "twenty-five-solved",
        icon: <Trophy className="w-5 h-5" />,
        label: "Grinder",
        description: "Solve 25 problems",
        color: "text-orange-400",
        tier: "gold",
        earned: (d) => d.solved.total >= 25,
    },
    {
        id: "fifty-solved",
        icon: <Trophy className="w-5 h-5" />,
        label: "DataWeave Master",
        description: "Solve 50 problems",
        color: "text-purple-400",
        tier: "platinum",
        earned: (d) => d.solved.total >= 50,
    },
    {
        id: "hard-solver",
        icon: <Target className="w-5 h-5" />,
        label: "Hard Mode",
        description: "Solve a Hard problem",
        color: "text-red-400",
        tier: "silver",
        earned: (d) => d.solved.hard >= 1,
    },
    {
        id: "hard-five",
        icon: <Target className="w-5 h-5" />,
        label: "Hard Hitter",
        description: "Solve 5 Hard problems",
        color: "text-red-500",
        tier: "gold",
        earned: (d) => d.solved.hard >= 5,
    },
    {
        id: "creator",
        icon: <Code2 className="w-5 h-5" />,
        label: "Creator",
        description: "Add your first problem manually",
        color: "text-blue-400",
        tier: "bronze",
        earned: (d) => d.problems.createdManually >= 1,
    },
    {
        id: "prolific",
        icon: <Code2 className="w-5 h-5" />,
        label: "Prolific",
        description: "Create 10 problems",
        color: "text-blue-500",
        tier: "silver",
        earned: (d) => d.problems.total >= 10,
    },
    {
        id: "ai-user",
        icon: <Cpu className="w-5 h-5" />,
        label: "AI-Assisted",
        description: "Generate a problem with AI",
        color: "text-cyan-400",
        tier: "bronze",
        earned: (d) => d.problems.createdByAI >= 1,
    },
    {
        id: "bookmarker",
        icon: <Star className="w-5 h-5" />,
        label: "Bookworm",
        description: "Bookmark 5 problems",
        color: "text-yellow-300",
        tier: "bronze",
        earned: (d) => d.bookmarks >= 5,
    },
    {
        id: "streak-3",
        icon: <Flame className="w-5 h-5" />,
        label: "On Fire",
        description: "3-day activity streak",
        color: "text-orange-400",
        tier: "bronze",
        earned: (d) => d.streak >= 3,
    },
    {
        id: "streak-7",
        icon: <Flame className="w-5 h-5" />,
        label: "Weekly Warrior",
        description: "7-day activity streak",
        color: "text-orange-500",
        tier: "silver",
        earned: (d) => d.streak >= 7,
    },
    {
        id: "streak-30",
        icon: <Flame className="w-5 h-5" />,
        label: "Unstoppable",
        description: "30-day activity streak",
        color: "text-red-500",
        tier: "gold",
        earned: (d) => d.streak >= 30,
    },
    {
        id: "submitter-50",
        icon: <TrendingUp className="w-5 h-5" />,
        label: "Active Coder",
        description: "Submit 50 times",
        color: "text-teal-400",
        tier: "silver",
        earned: (d) => d.submissions.total >= 50,
    },
    {
        id: "high-accuracy",
        icon: <Award className="w-5 h-5" />,
        label: "Sharp Eye",
        description: "Achieve 80%+ acceptance rate (min 10 submissions)",
        color: "text-emerald-400",
        tier: "gold",
        earned: (d) => d.submissions.total >= 10 && d.submissions.acceptanceRate >= 80,
    },
];

const TIER_COLORS: Record<string, string> = {
    bronze: "border-amber-700/60 bg-amber-900/10",
    silver: "border-slate-400/60 bg-slate-500/10",
    gold: "border-yellow-400/60 bg-yellow-400/10",
    platinum: "border-purple-400/60 bg-purple-400/10",
};

// ─── Activity Heatmap ─────────────────────────────────────────────────────────

function Heatmap({ data }: { data: { date: string; count: number }[] }) {
    const max = Math.max(...data.map((d) => d.count), 1);

    const color = (count: number) => {
        if (count === 0) return "bg-muted/40";
        const pct = count / max;
        if (pct < 0.25) return "bg-green-800/60";
        if (pct < 0.5) return "bg-green-600/70";
        if (pct < 0.75) return "bg-green-500/80";
        return "bg-green-400";
    };

    return (
        <div className="flex gap-1 flex-wrap">
            {data.map((d) => (
                <div
                    key={d.date}
                    title={`${d.date}: ${d.count} submission${d.count !== 1 ? "s" : ""}`}
                    className={`w-4 h-4 rounded-sm ${color(d.count)} cursor-default transition-colors`}
                />
            ))}
        </div>
    );
}

// ─── Donut-style progress ring ────────────────────────────────────────────────

function ProgressRing({ value, max, color, size = 80 }: { value: number; max: number; color: string; size?: number }) {
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const dash = pct * circ;

    return (
        <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="stroke-muted/40" fill="none" />
            <circle
                cx={size / 2} cy={size / 2} r={r} strokeWidth={6}
                fill="none"
                stroke="currentColor"
                className={color}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeLinecap="round"
            />
        </svg>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const RANK_TIERS = [
    { min: 100, label: "Grandmaster", color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", icon: "🏆" },
    { min: 50, label: "Master", color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/30", icon: "💎" },
    { min: 25, label: "Expert", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", icon: "🔵" },
    { min: 10, label: "Specialist", color: "text-cyan-500", bg: "bg-cyan-500/10 border-cyan-500/30", icon: "⭐" },
    { min: 3, label: "Apprentice", color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: "🌱" },
    { min: 0, label: "Novice", color: "text-muted-foreground", bg: "bg-muted/40 border-border", icon: "🐣" },
];
function getTier(score: number) {
    return RANK_TIERS.find((t) => score >= t.min) ?? RANK_TIERS[RANK_TIERS.length - 1];
}

export default function ProfilePage() {
    const { user, isSignedIn, isLoaded } = useUser();
    const [data, setData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rank, setRank] = useState<number | null>(null);
    const [score, setScore] = useState<number>(0);
    const [coins, setCoins] = useState<{ balance: number; transactions: CoinTransaction[] }>({ balance: 0, transactions: [] });

    // Edit Profile state
    const [editOpen, setEditOpen] = useState(false);
    const [editUsername, setEditUsername] = useState("");
    const [editBio, setEditBio] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState("");

    useEffect(() => {
        fetch("/api/profile")
            .then((r) => r.json())
            .then((d) => {
                if (d.error) throw new Error(d.error);
                if (!d.username) {
                    // Auto-setup profile if username is missing
                    return fetch("/api/profile/setup", { method: "POST" })
                        .then(res => res.json())
                        .then(setupData => {
                            setData({ ...d, username: setupData.profile?.username, bio: setupData.profile?.bio, followers: 0, following: 0 });
                        });
                } else {
                    setData(d);
                    setEditUsername(d.username || "");
                    setEditBio(d.bio || "");
                }
            })
            .catch((error: unknown) => setError(getErrorMessage(error)))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetch("/api/coins")
            .then((r) => r.json())
            .then((d) => { if (typeof d.balance === "number") setCoins(d); })
            .catch(() => { });
    }, []);

    // Fetch leaderboard to get rank
    useEffect(() => {
        if (!user) return;
        fetch("/api/leaderboard")
            .then((r) => r.json())
            .then((d: { leaderboard?: LeaderboardEntry[] }) => {
                if (d.leaderboard) {
                    const idx = d.leaderboard.findIndex((row: { userId: string }) => row.userId === user.id);
                    if (idx !== -1) { setRank(idx + 1); setScore(d.leaderboard[idx].score); }
                }
            })
            .catch(() => { });
    }, [user]);

    if (!isLoaded || loading) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Loading profile…
            </div>
        );
    }

    if (!isSignedIn) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
                <Code2 className="w-10 h-10 opacity-30" />
                <p className="text-sm">Sign in to view your profile.</p>
                <SignInButton mode="modal">
                    <Button>Sign In</Button>
                </SignInButton>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center h-64 text-red-500 text-sm">
                Failed to load profile: {error}
            </div>
        );
    }

    const earnedBadges = BADGE_DEFS.filter((b) => b.earned(data));
    const lockedBadges = BADGE_DEFS.filter((b) => !b.earned(data));
    const solvedPct = data.problems.total > 0
        ? Math.round((data.solved.total / data.problems.total) * 100)
        : 0;
    const tier = getTier(score);

    return (
        <div className="container max-w-screen-xl mx-auto py-10 px-4 space-y-8">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    {user?.imageUrl ? (
                        <Image unoptimized src={user.imageUrl} width={64} height={64} className="w-16 h-16 rounded-full border-2 border-primary/30" alt={user.fullName || ""} />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <Code2 className="w-7 h-7 text-primary" />
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{user?.fullName || "My Profile"}</h1>
                        <p className="text-muted-foreground text-sm mt-0.5">{user?.primaryEmailAddress?.emailAddress}</p>
                        {data.username && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                                <Badge variant="secondary" className="text-xs font-mono w-fit px-2 py-0.5">@{data.username}</Badge>
                                <span className="text-xs text-muted-foreground">{data.followers} followers · {data.following} following</span>
                                <Link href={`/profile/${data.username}`} className="text-xs text-primary hover:underline ml-1">View Public Profile →</Link>
                            </div>
                        )}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            <Badge className={`border text-xs ${tier.bg} ${tier.color}`}>
                                {tier.icon} {tier.label}
                            </Badge>
                            {rank && (
                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                    <Medal className="w-3 h-3" /> Rank #{rank}
                                </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">{earnedBadges.length}/{BADGE_DEFS.length} badges</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {!data.githubConnected ? (
                        <a href="/api/auth/github">
                            <Button variant="outline" size="sm" className="bg-[#24292e] text-white hover:bg-[#24292e]/90 hover:text-white border-0 gap-2 h-8 text-xs">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                                </svg>
                                Connect GitHub
                            </Button>
                        </a>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="px-3 py-1.5 text-xs bg-[#24292e]/5 border-[#24292e]/20 text-[#24292e] dark:bg-[#24292e] dark:text-white dark:border-[#24292e] flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" className="mr-1.5">
                                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                                </svg>
                                {data.githubUsername}
                            </Badge>
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-red-500 px-2" onClick={() => {
                                if (confirm("Are you sure you want to disconnect your GitHub account?")) {
                                    void fetch('/api/auth/github/disconnect', { method: 'POST' }).then(() => window.location.reload());
                                }
                            }}>
                                Disconnect
                            </Button>
                        </div>
                    )}
                    <Link href="/problems">
                        <Badge variant="outline" className="cursor-pointer hover:bg-accent px-3 py-1.5 text-xs">
                            Browse Problems
                        </Badge>
                    </Link>
                    <Link href="/playground">
                        <Badge variant="outline" className="cursor-pointer hover:bg-accent px-3 py-1.5 text-xs">
                            Playground
                        </Badge>
                    </Link>
                    <Link href="/leaderboard">
                        <Badge variant="outline" className="cursor-pointer hover:bg-accent px-3 py-1.5 text-xs">
                            Leaderboard
                        </Badge>
                    </Link>

                    <Dialog open={editOpen} onOpenChange={setEditOpen}>
                        <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 ml-auto" />}>
                            <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Edit Profile</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                {editError && <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded">{editError}</div>}
                                <div className="space-y-2">
                                    <Label htmlFor="username">Username</Label>
                                    <Input 
                                        id="username" 
                                        value={editUsername} 
                                        onChange={e => setEditUsername(e.target.value)} 
                                        placeholder="e.g. dataweave_pro"
                                    />
                                    <p className="text-[10px] text-muted-foreground">Only letters, numbers, and underscores.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bio">Bio</Label>
                                    <Textarea 
                                        id="bio" 
                                        value={editBio} 
                                        onChange={e => setEditBio(e.target.value)} 
                                        placeholder="Tell us about yourself..." 
                                        className="resize-none"
                                        rows={3}
                                    />
                                </div>
                                <Button 
                                    className="w-full" 
                                    disabled={editSaving} 
                                    onClick={async () => {
                                        setEditSaving(true);
                                        setEditError("");
                                        try {
                                            const res = await fetch("/api/profile/username", {
                                                method: "PUT",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ username: editUsername, bio: editBio })
                                            });
                                            const dataRes = await res.json();
                                            if (dataRes.error) throw new Error(dataRes.error);
                                            setData((previous) => previous
                                                ? { ...previous, username: dataRes.profile.username, bio: dataRes.profile.bio }
                                                : previous);
                                            setEditOpen(false);
                                        } catch (error) {
                                            setEditError(getErrorMessage(error));
                                        } finally {
                                            setEditSaving(false);
                                        }
                                    }}
                                >
                                    {editSaving ? "Saving..." : "Save Changes"}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* ── Top stats ── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                    icon={<Trophy className="w-4 h-4" />}
                    label="Problems Solved"
                    value={data.solved.total}
                    sub={`${solvedPct}% of ${data.problems.total} total`}
                    color="text-green-500"
                />
                <StatCard
                    icon={<Zap className="w-4 h-4" />}
                    label="Submissions"
                    value={data.submissions.total}
                    sub={`${data.submissions.acceptanceRate}% acceptance rate`}
                    color="text-blue-500"
                />
                <StatCard
                    icon={<Flame className="w-4 h-4" />}
                    label="Current Streak"
                    value={data.streak}
                    sub={data.streak === 1 ? "day active" : "days active"}
                    color="text-orange-500"
                />
                <StatCard
                    icon={<Star className="w-4 h-4" />}
                    label="Bookmarked"
                    value={data.bookmarks}
                    sub="saved for revision"
                    color="text-yellow-400"
                />
                <StatCard
                    icon={<Coins className="w-4 h-4" />}
                    label="Coins"
                    value={coins.balance}
                    sub="earned from activity"
                    color="text-yellow-500"
                />
            </div>

            {/* ── Solved breakdown + Activity heatmap ── */}
            <div className="grid gap-6 md:grid-cols-2">

                {/* Solve breakdown */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart2 className="w-4 h-4 text-primary" /> Solve Breakdown
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-around gap-4">
                            {[
                                { label: "Easy", value: data.solved.easy, total: data.problems.easy, color: "text-green-500" },
                                { label: "Medium", value: data.solved.medium, total: data.problems.medium, color: "text-yellow-500" },
                                { label: "Hard", value: data.solved.hard, total: data.problems.hard, color: "text-red-500" },
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
                        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div>Problems in DB: <span className="font-semibold text-foreground">{data.problems.total}</span></div>
                            <div>Attempted: <span className="font-semibold text-yellow-500">{data.attempted}</span></div>
                            <div>Created by AI: <span className="font-semibold text-cyan-400">{data.problems.createdByAI}</span></div>
                            <div>Created manually: <span className="font-semibold text-blue-400">{data.problems.createdManually}</span></div>
                        </div>
                    </CardContent>
                </Card>

                {/* Activity heatmap */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <TrendingUp className="w-4 h-4 text-primary" /> Activity — Last 30 Days
                        </CardTitle>
                        <CardDescription className="text-xs">Each cell = one day. Darker = more submissions.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Heatmap data={data.activityData} />
                        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                            <span>Total this month: <span className="font-semibold text-foreground">{data.activityData.reduce((a, d) => a + d.count, 0)}</span> submissions</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Badges ── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Award className="w-4 h-4 text-primary" /> Badges
                    </CardTitle>
                    <CardDescription className="text-xs">
                        {earnedBadges.length} earned · {lockedBadges.length} locked
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Earned */}
                    {earnedBadges.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Earned</p>
                            <div className="flex flex-wrap gap-3">
                                {earnedBadges.map((b) => (
                                    <div
                                        key={b.id}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${TIER_COLORS[b.tier ?? "bronze"]}`}
                                        title={b.description}
                                    >
                                        <span className={b.color}>{b.icon}</span>
                                        <div>
                                            <p className="text-xs font-semibold leading-none">{b.label}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{b.description}</p>
                                        </div>
                                        <TierPip tier={b.tier} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Locked */}
                    {lockedBadges.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Locked</p>
                            <div className="flex flex-wrap gap-3">
                                {lockedBadges.map((b) => (
                                    <div
                                        key={b.id}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/20 opacity-50 grayscale"
                                        title={b.description}
                                    >
                                        <span className="text-muted-foreground">{b.icon}</span>
                                        <div>
                                            <p className="text-xs font-semibold leading-none">{b.label}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{b.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Coins History ── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Coins className="w-4 h-4 text-yellow-500" /> Coins
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Balance: <span className="font-bold text-yellow-500">{coins.balance}</span> coins · Last 20 transactions
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {coins.transactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No coin transactions yet. Start solving problems!</p>
                    ) : (
                        <div className="space-y-2">
                            {coins.transactions.map((t, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-md bg-muted/20 hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.amount > 0 ? "bg-yellow-500" : "bg-red-500"}`} />
                                        <span className="text-sm truncate">{t.description || t.type}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs flex-shrink-0">
                                        <span className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>
                                        <span className={`font-bold ${t.amount > 0 ? "text-yellow-500" : "text-red-500"}`}>
                                            {t.amount > 0 ? "+" : ""}{t.amount}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Activity Log ── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BookOpen className="w-4 h-4 text-primary" /> Recent Activity Log
                    </CardTitle>
                    <CardDescription className="text-xs">Your last 20 code submissions.</CardDescription>
                </CardHeader>
                <CardContent>
                    {data.recentLog.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No submissions yet. Start solving!</p>
                    ) : (
                        <div className="space-y-2">
                            {data.recentLog.map((entry, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-muted/20 hover:bg-muted/30 transition-colors group"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <StatusDot status={entry.status} />
                                        <Link
                                            href={`/problems/${entry.problemSlug}`}
                                            className="text-sm font-medium hover:text-primary transition-colors truncate"
                                        >
                                            {entry.problemSlug}
                                        </Link>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                                        <span className="font-mono">{entry.executionTime}</span>
                                        <span>{new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                        <span
                                            className={`font-semibold ${entry.status === "Accepted"
                                                ? "text-green-500"
                                                : entry.status === "Error"
                                                    ? "text-red-500"
                                                    : "text-yellow-500"
                                                }`}
                                        >
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
    icon, label, value, sub, color,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    sub: string;
    color: string;
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <span className={color}>{icon}</span> {label}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className={`text-3xl font-bold ${color}`}>{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
        </Card>
    );
}

function StatusDot({ status }: { status: string }) {
    const cls =
        status === "Accepted"
            ? "bg-green-500"
            : status === "Error"
                ? "bg-red-500"
                : "bg-yellow-500";
    return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />;
}

function TierPip({ tier }: { tier?: string }) {
    const labels: Record<string, string> = {
        bronze: "🥉",
        silver: "🥈",
        gold: "🥇",
        platinum: "💎",
    };
    if (!tier) return null;
    return <span className="text-xs ml-1">{labels[tier]}</span>;
}
