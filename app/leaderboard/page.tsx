"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, TrendingUp, Zap, Target, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardRow {
    userId: string;
    userName: string;
    userImageUrl: string;
    totalSolved: number;
    easy: number;
    medium: number;
    hard: number;
    score: number;
    totalSubmissions: number;
    acceptanceRate: number;
}

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

function RankBadge({ rank }: { rank: number }) {
    if (rank === 1) return <span className="text-lg">🥇</span>;
    if (rank === 2) return <span className="text-lg">🥈</span>;
    if (rank === 3) return <span className="text-lg">🥉</span>;
    return (
        <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
            {rank}
        </span>
    );
}

export default function LeaderboardPage() {
    const { user } = useUser();
    const [data, setData] = useState<{ leaderboard: LeaderboardRow[]; meta: any } | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "score" | "solved" | "acceptance">("all");

    useEffect(() => {
        fetch("/api/leaderboard")
            .then((r) => r.json())
            .then((d) => { if (!d.error) setData(d); })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading leaderboard…
            </div>
        );
    }

    const rows = data?.leaderboard ?? [];
    const myRow = rows.find((r) => r.userId === user?.id);
    const myRank = myRow ? rows.indexOf(myRow) + 1 : null;

    // Sort variants
    const sorted = [...rows].sort((a, b) => {
        if (filter === "solved") return b.totalSolved - a.totalSolved;
        if (filter === "acceptance") return b.acceptanceRate - a.acceptanceRate;
        return b.score - a.score;
    });

    return (
        <div className="container max-w-screen-lg mx-auto py-10 px-4 space-y-8">

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <Trophy className="w-7 h-7 text-primary" />
                    Leaderboard
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    Rankings based on score (Hard=5pts, Medium=3pts, Easy=1pt per unique problem solved).
                </p>
            </div>

            {/* My rank card */}
            {myRow && myRank && (
                <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3">
                                <div className="text-2xl font-bold text-primary">#{myRank}</div>
                                <div>
                                    <p className="font-semibold text-sm">{myRow.userName} <Badge variant="outline" className="ml-1 text-[10px] py-0">You</Badge></p>
                                    <p className="text-xs text-muted-foreground">Score: {myRow.score} · {myRow.totalSolved} solved</p>
                                </div>
                                <Badge className={`border text-xs ${getTier(myRow.score).bg} ${getTier(myRow.score).color}`}>
                                    {getTier(myRow.score).icon} {getTier(myRow.score).label}
                                </Badge>
                            </div>
                            <div className="flex gap-4 text-center text-xs">
                                <div><p className="font-bold text-green-500 text-lg">{myRow.easy}</p><p className="text-muted-foreground">Easy</p></div>
                                <div><p className="font-bold text-yellow-500 text-lg">{myRow.medium}</p><p className="text-muted-foreground">Medium</p></div>
                                <div><p className="font-bold text-red-500 text-lg">{myRow.hard}</p><p className="text-muted-foreground">Hard</p></div>
                                <div><p className="font-bold text-blue-500 text-lg">{myRow.acceptanceRate}%</p><p className="text-muted-foreground">Acceptance</p></div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tier legend */}
            <div className="flex flex-wrap gap-2">
                {RANK_TIERS.map((t) => (
                    <span key={t.label} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${t.bg} ${t.color}`}>
                        {t.icon} {t.label}
                        <span className="opacity-60">{t.min === 0 ? "0+" : `${t.min}+`} pts</span>
                    </span>
                ))}
            </div>

            {/* Table */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Medal className="w-4 h-4 text-primary" /> Rankings ({rows.length} users)
                        </CardTitle>
                        {/* Sort controls */}
                        <div className="flex gap-1.5">
                            {[
                                { key: "all" as const, label: "Score", icon: <Trophy className="w-3 h-3" /> },
                                { key: "solved" as const, label: "Solved", icon: <Target className="w-3 h-3" /> },
                                { key: "acceptance" as const, label: "Accuracy", icon: <TrendingUp className="w-3 h-3" /> },
                            ].map((s) => (
                                <button
                                    key={s.key}
                                    onClick={() => setFilter(s.key)}
                                    className={cn(
                                        "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                                        filter === s.key
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted/40 text-muted-foreground hover:bg-muted"
                                    )}
                                >
                                    {s.icon} {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {sorted.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p>No data yet. Start solving problems to appear here!</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {sorted.map((row, i) => {
                                const rank = i + 1;
                                const tier = getTier(row.score);
                                const isMe = row.userId === user?.id;
                                return (
                                    <div
                                        key={row.userId}
                                        className={cn(
                                            "flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/20",
                                            isMe ? "bg-primary/5" : "",
                                            rank === 1 ? "bg-yellow-500/5 hover:bg-yellow-500/10" : "",
                                        )}
                                    >
                                        {/* Rank */}
                                        <div className="w-8 flex justify-center flex-shrink-0">
                                            <RankBadge rank={rank} />
                                        </div>

                                        {/* Avatar + name */}
                                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                            {row.userImageUrl ? (
                                                <img src={row.userImageUrl} className="w-8 h-8 rounded-full flex-shrink-0" alt={row.userName} />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                                                    {(row.userName || "?")[0].toUpperCase()}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-medium truncate">{row.userName}</p>
                                                    {isMe && <Badge variant="outline" className="text-[10px] py-0">You</Badge>}
                                                </div>
                                                <Badge className={`text-[10px] py-0 border mt-0.5 ${tier.bg} ${tier.color}`}>
                                                    {tier.icon} {tier.label}
                                                </Badge>
                                            </div>
                                        </div>

                                        {/* Score */}
                                        <div className="text-right hidden sm:block">
                                            <p className="font-bold text-base">{row.score}</p>
                                            <p className="text-[10px] text-muted-foreground">pts</p>
                                        </div>

                                        {/* Breakdown */}
                                        <div className="hidden md:flex gap-4 text-center text-xs">
                                            <div>
                                                <p className="font-bold text-green-500">{row.easy}</p>
                                                <p className="text-muted-foreground">Easy</p>
                                            </div>
                                            <div>
                                                <p className="font-bold text-yellow-500">{row.medium}</p>
                                                <p className="text-muted-foreground">Med</p>
                                            </div>
                                            <div>
                                                <p className="font-bold text-red-500">{row.hard}</p>
                                                <p className="text-muted-foreground">Hard</p>
                                            </div>
                                            <div>
                                                <p className="font-bold text-blue-400">{row.acceptanceRate}%</p>
                                                <p className="text-muted-foreground">Acc.</p>
                                            </div>
                                        </div>

                                        {/* Total solved */}
                                        <div className="text-right flex-shrink-0 min-w-[50px]">
                                            <p className="text-sm font-semibold">{row.totalSolved}</p>
                                            <p className="text-[10px] text-muted-foreground">solved</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
