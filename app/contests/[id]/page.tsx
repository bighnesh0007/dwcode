"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Trophy, Clock, Users, Calendar, ArrowLeft,
    Globe, Lock, Loader2, Copy, Check, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatDate(d: string) {
    return new Date(d).toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function TimeLeft({ endTime, status }: { endTime: string; status: string }) {
    const [left, setLeft] = useState("");
    useEffect(() => {
        if (status === "ended") { setLeft("Contest ended"); return; }
        const update = () => {
            const diff = new Date(endTime).getTime() - Date.now();
            if (diff <= 0) { setLeft("Ended"); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setLeft(`${h}h ${m}m ${s}s`);
        };
        update();
        const t = setInterval(update, 1000);
        return () => clearInterval(t);
    }, [endTime, status]);
    return <span className="font-mono">{left}</span>;
}

export default function ContestDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const { user, isSignedIn } = useUser();

    const [contest, setContest] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchContest = async () => {
        try {
            const res = await fetch(`/api/contests/${id}`);
            const data = await res.json();
            if (!data.error) setContest(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchContest(); }, [id]);

    const handleJoin = async () => {
        if (!isSignedIn) return;
        setJoining(true);
        try {
            const res = await fetch(`/api/contests/${id}?action=join`, { method: "POST" });
            const data = await res.json();
            if (data.success) fetchContest();
        } finally {
            setJoining(false);
        }
    };

    const handleLeave = async () => {
        if (!isSignedIn) return;
        setJoining(true);
        try {
            const res = await fetch(`/api/contests/${id}?action=leave`, { method: "POST" });
            const data = await res.json();
            if (data.success) fetchContest();
        } finally {
            setJoining(false);
        }
    };

    const copyCode = () => {
        navigator.clipboard.writeText(contest?.inviteCode || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading contest…
            </div>
        );
    }

    if (!contest) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
                <Trophy className="w-12 h-12 opacity-20" />
                <p>Contest not found.</p>
                <Link href="/contests"><Button variant="outline">Back to Contests</Button></Link>
            </div>
        );
    }

    const isParticipant = contest.participants?.some((p: any) => p.userId === user?.id);
    const canEnter = (contest.status === "active" || contest.status === "upcoming") && isParticipant;

    const STATUS_COLORS: Record<string, string> = {
        upcoming: "text-blue-500 bg-blue-500/10 border-blue-500/30",
        active: "text-green-500 bg-green-500/10 border-green-500/30",
        ended: "text-muted-foreground bg-muted/40 border-border",
    };

    return (
        <div className="container max-w-screen-lg mx-auto py-10 px-4 space-y-8">

            {/* Back */}
            <Link href="/contests" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
                <ArrowLeft className="w-4 h-4" />
                Back to Contests
            </Link>

            {/* Header card */}
            <Card className={cn(contest.status === "active" ? "ring-1 ring-green-500/30" : "")}>
                {contest.status === "active" && (
                    <div className="h-1 bg-gradient-to-r from-green-500/0 via-green-500 to-green-500/0 rounded-t-lg" />
                )}
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className="text-2xl font-bold tracking-tight">{contest.title}</h1>
                                <Badge className={`border text-xs ${STATUS_COLORS[contest.status]}`}>
                                    {contest.status === "active" && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block animate-pulse" />
                                    )}
                                    {contest.status.charAt(0).toUpperCase() + contest.status.slice(1)}
                                </Badge>
                            </div>
                            {contest.description && (
                                <p className="text-muted-foreground text-sm mt-2">{contest.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">Created by {contest.createdByName}</p>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                            {!isSignedIn ? (
                                <SignInButton mode="modal">
                                    <Button>Sign in to Join</Button>
                                </SignInButton>
                            ) : isParticipant ? (
                                <>
                                    {contest.status === "active" && (
                                        <Link href={`/problems/${contest.problems?.[0]?.slug}`}>
                                            <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white border-0">
                                                <ExternalLink className="w-4 h-4" /> Enter Contest
                                            </Button>
                                        </Link>
                                    )}
                                    <Button variant="outline" onClick={handleLeave} disabled={joining}>
                                        {joining ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                                        Leave
                                    </Button>
                                </>
                            ) : contest.status !== "ended" ? (
                                <Button onClick={handleJoin} disabled={joining} className="gap-2">
                                    {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Join Contest
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Start</p>
                            <p className="font-medium text-xs">{formatDate(contest.startTime)}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Duration</p>
                            <p className="font-medium">{contest.duration} min</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Participants</p>
                            <p className="font-medium">{contest.participants?.length ?? 0} / {contest.maxParticipants}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                {contest.isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                Visibility
                            </p>
                            <p className="font-medium">{contest.isPublic ? "Public" : "Private"}</p>
                        </div>
                    </div>

                    {contest.status === "active" && (
                        <div className="mt-4 flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-500 rounded-lg px-4 py-2.5 text-sm">
                            <Clock className="w-4 h-4" />
                            <span className="font-medium">Time remaining:</span>
                            <TimeLeft endTime={contest.endTime} status={contest.status} />
                        </div>
                    )}

                    {contest.inviteCode && (
                        <div className="mt-4 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Invite code:</span>
                            <code className="bg-muted px-2.5 py-1 rounded text-sm font-mono font-semibold">
                                {contest.inviteCode}
                            </code>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyCode}>
                                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Problems */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Problems ({contest.problems?.length ?? 0})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {(contest.problems || []).map((p: any, i: number) => (
                            <div key={p._id || p.slug} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/30 transition-colors group">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                                        {i + 1}
                                    </span>
                                    {canEnter ? (
                                        <Link href={`/problems/${p.slug}`} className="text-sm font-medium hover:text-primary transition-colors truncate">
                                            {p.title}
                                        </Link>
                                    ) : (
                                        <span className="text-sm font-medium text-muted-foreground truncate">
                                            {canEnter ? p.title : (contest.status === "upcoming" ? "???" : p.title)}
                                        </span>
                                    )}
                                </div>
                                <Badge variant="outline" className={`text-[10px] py-0 shrink-0 ${p.difficulty === "Easy" ? "text-green-500 border-green-500/30" :
                                        p.difficulty === "Medium" ? "text-yellow-500 border-yellow-500/30" :
                                            "text-red-500 border-red-500/30"
                                    }`}>{p.difficulty}</Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Leaderboard */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-primary" />
                            Standings ({contest.participants?.length ?? 0})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(contest.participants || []).length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">No participants yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {[...(contest.participants || [])]
                                    .sort((a: any, b: any) => b.score - a.score)
                                    .map((p: any, i: number) => (
                                        <div key={p.userId} className={cn(
                                            "flex items-center justify-between gap-2 p-2 rounded-md",
                                            i === 0 ? "bg-yellow-500/10 border border-yellow-500/20" :
                                                i === 1 ? "bg-slate-500/10 border border-slate-500/20" :
                                                    i === 2 ? "bg-amber-700/10 border border-amber-700/20" :
                                                        "bg-muted/20"
                                        )}>
                                            <div className="flex items-center gap-2.5">
                                                <span className={cn(
                                                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                                    i === 0 ? "bg-yellow-400 text-yellow-900" :
                                                        i === 1 ? "bg-slate-400 text-slate-900" :
                                                            i === 2 ? "bg-amber-700 text-white" :
                                                                "bg-muted text-muted-foreground"
                                                )}>
                                                    {i + 1}
                                                </span>
                                                {p.userImageUrl ? (
                                                    <img src={p.userImageUrl} className="w-6 h-6 rounded-full" alt={p.userName} />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                                        {(p.userName || "?")[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <span className="text-sm font-medium">{p.userName}</span>
                                                {p.userId === user?.id && (
                                                    <Badge variant="outline" className="text-[10px] py-0">You</Badge>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold">{p.score}</p>
                                                <p className="text-[10px] text-muted-foreground">{p.solvedProblems?.length ?? 0} solved</p>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
