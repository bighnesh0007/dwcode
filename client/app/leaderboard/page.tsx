"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ChevronLeft, ChevronRight, Loader2, Medal, Target, TrendingUp, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RANK_TIERS, getTier } from "@/lib/ranks";

interface LeaderboardRow {
    userId: string;
    userName: string;
    userImageUrl: string;
    /** Public-profile handle; null when the user never completed profile setup. */
    username: string | null;
    totalSolved: number;
    easy: number;
    medium: number;
    hard: number;
    score: number;
    totalSubmissions: number;
    acceptanceRate: number;
    /** Canonical score-based rank — stable across every sort. */
    rank: number;
}

interface LeaderboardResponse {
    leaderboard: LeaderboardRow[];
    me: LeaderboardRow | null;
    pagination: { page: number; limit: number; totalUsers: number; totalPages: number; sort: string };
    meta: { totalProblems: number; easyCount: number; mediumCount: number; hardCount: number };
    error?: string;
}

type SortKey = "score" | "solved" | "acceptance";

const PAGE_SIZE = 25;

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

function Avatar({ name, imageUrl }: { name: string; imageUrl: string }) {
    return imageUrl ? (
        <Image
            unoptimized
            src={imageUrl}
            width={32}
            height={32}
            className="w-8 h-8 rounded-full flex-shrink-0"
            alt={name}
        />
    ) : (
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
            {(name || "?")[0].toUpperCase()}
        </div>
    );
}

export default function LeaderboardPage() {
    const { user } = useUser();
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetching, setFetching] = useState(false);
    const [sort, setSort] = useState<SortKey>("score");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const controller = new AbortController();
        queueMicrotask(() => {
            setFetching(true);
            void fetch(`/api/leaderboard?page=${page}&limit=${PAGE_SIZE}&sort=${sort}`, {
                signal: controller.signal,
            })
                .then((r) => r.json())
                .then((d: LeaderboardResponse) => {
                    if (controller.signal.aborted || d.error) return;
                    setData(d);
                })
                .catch(() => {
                    /* aborted or offline — keep previous page */
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setLoading(false);
                        setFetching(false);
                    }
                });
        });
        return () => {
            controller.abort();
        };
    }, [page, sort]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading leaderboard…
            </div>
        );
    }

    const rows = data?.leaderboard ?? [];
    const me = data?.me ?? null;
    const pagination = data?.pagination ?? { page: 1, limit: PAGE_SIZE, totalUsers: rows.length, totalPages: 1, sort };
    const rangeStart = pagination.totalUsers === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
    const rangeEnd = Math.min(pagination.page * pagination.limit, pagination.totalUsers);

    const changeSort = (next: SortKey) => {
        if (next === sort) return;
        setSort(next);
        setPage(1);
    };

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
                    Click any player to visit their profile.
                </p>
            </div>

            {/* My rank card — page-independent thanks to `me` from the API */}
            {me && (
                <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3">
                                <div className="text-2xl font-bold text-primary">#{me.rank}</div>
                                <div>
                                    <p className="font-semibold text-sm">
                                        {me.userName}{" "}
                                        <Badge variant="outline" className="ml-1 text-[10px] py-0">You</Badge>
                                    </p>
                                    <p className="text-xs text-muted-foreground">Score: {me.score} · {me.totalSolved} solved</p>
                                </div>
                                <Badge className={`border text-xs ${getTier(me.score).bg} ${getTier(me.score).color}`}>
                                    {getTier(me.score).icon} {getTier(me.score).label}
                                </Badge>
                            </div>
                            <div className="flex gap-4 text-center text-xs">
                                <div><p className="font-bold text-green-500 text-lg">{me.easy}</p><p className="text-muted-foreground">Easy</p></div>
                                <div><p className="font-bold text-yellow-500 text-lg">{me.medium}</p><p className="text-muted-foreground">Medium</p></div>
                                <div><p className="font-bold text-red-500 text-lg">{me.hard}</p><p className="text-muted-foreground">Hard</p></div>
                                <div><p className="font-bold text-blue-500 text-lg">{me.acceptanceRate}%</p><p className="text-muted-foreground">Acceptance</p></div>
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
                            <Medal className="w-4 h-4 text-primary" /> Rankings ({pagination.totalUsers} users)
                        </CardTitle>
                        {/* Sort controls (server-side; rank numbers stay canonical) */}
                        <div className="flex gap-1.5">
                            {[
                                { key: "score" as const, label: "Score", icon: <Trophy className="w-3 h-3" /> },
                                { key: "solved" as const, label: "Solved", icon: <Target className="w-3 h-3" /> },
                                { key: "acceptance" as const, label: "Accuracy", icon: <TrendingUp className="w-3 h-3" /> },
                            ].map((s) => (
                                <button
                                    key={s.key}
                                    onClick={() => { changeSort(s.key); }}
                                    className={cn(
                                        "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                                        sort === s.key
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
                    {rows.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p>No data yet. Start solving problems to appear here!</p>
                        </div>
                    ) : (
                        <div className={cn("divide-y transition-opacity", fetching && "opacity-60")}>
                            {rows.map((row) => {
                                const tier = getTier(row.score);
                                const isMe = row.userId === user?.id;
                                const profileHref = row.username ? `/profile/${row.username}` : null;

                                const identity = (
                                    <>
                                        <Avatar name={row.userName} imageUrl={row.userImageUrl} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className={cn(
                                                    "text-sm font-medium truncate",
                                                    profileHref && "group-hover/row:text-primary group-hover/row:underline underline-offset-2 transition-colors",
                                                )}>
                                                    {row.userName}
                                                </p>
                                                {isMe && <Badge variant="outline" className="text-[10px] py-0">You</Badge>}
                                            </div>
                                            <Badge className={`text-[10px] py-0 border mt-0.5 ${tier.bg} ${tier.color}`}>
                                                {tier.icon} {tier.label}
                                            </Badge>
                                        </div>
                                    </>
                                );

                                return (
                                    <div
                                        key={row.userId}
                                        className={cn(
                                            "flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/20",
                                            isMe ? "bg-primary/5" : "",
                                            row.rank === 1 ? "bg-yellow-500/5 hover:bg-yellow-500/10" : "",
                                        )}
                                    >
                                        {/* Canonical rank */}
                                        <div className="w-8 flex justify-center flex-shrink-0">
                                            <RankBadge rank={row.rank} />
                                        </div>

                                        {/* Avatar + name — links to the public profile when one exists */}
                                        {profileHref ? (
                                            <Link
                                                href={profileHref}
                                                className="group/row flex items-center gap-2.5 flex-1 min-w-0"
                                                title={`View @${row.username ?? ""}'s profile`}
                                            >
                                                {identity}
                                            </Link>
                                        ) : (
                                            <div
                                                className="flex items-center gap-2.5 flex-1 min-w-0"
                                                title="This user has no public profile yet"
                                            >
                                                {identity}
                                            </div>
                                        )}

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

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                            <p className="text-xs text-muted-foreground">
                                {rangeStart}–{rangeEnd} of {pagination.totalUsers}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    disabled={pagination.page <= 1 || fetching}
                                    onClick={() => { setPage((p) => Math.max(1, p - 1)); }}
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                                </Button>
                                <span className="text-xs font-medium tabular-nums">
                                    Page {pagination.page} / {pagination.totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    disabled={pagination.page >= pagination.totalPages || fetching}
                                    onClick={() => { setPage((p) => p + 1); }}
                                >
                                    Next <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
