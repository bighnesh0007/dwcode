"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Trophy, Clock, Users, Plus, Calendar,
    Lock, Globe, ChevronRight, Loader2, Check, X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Contest {
    _id: string;
    title: string;
    description: string;
    createdByName: string;
    startTime: string;
    endTime: string;
    duration: number;
    status: string;
    isPublic: boolean;
    participantCount: number;
    maxParticipants: number;
    problems: { title: string; slug: string; difficulty: string }[];
    inviteCode?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    upcoming: { label: "Upcoming", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30" },
    active: { label: "Live", color: "text-green-500", bg: "bg-green-500/10 border-green-500/30" },
    ended: { label: "Ended", color: "text-muted-foreground", bg: "bg-muted/40 border-border" },
};

function formatDate(d: string) {
    return new Date(d).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
}

function TimeLeft({ endTime, status }: { endTime: string; status: string }) {
    const [left, setLeft] = useState("");

    useEffect(() => {
        if (status === "ended") { setLeft("Ended"); return; }
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

    return <span className="font-mono text-xs">{left}</span>;
}

export default function ContestsPage() {
    const { user, isSignedIn } = useUser();
    const [contests, setContests] = useState<Contest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [joiningId, setJoiningId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "active" | "ended">("all");

    // Create form state
    const [allProblems, setAllProblems] = useState<any[]>([]);
    const [form, setForm] = useState({
        title: "", description: "", duration: "60",
        startTime: "", isPublic: true, maxParticipants: "50",
    });
    const [selectedProblems, setSelectedProblems] = useState<string[]>([]);
    const [creating, setCreating] = useState(false);
    const [createMsg, setCreateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const fetchContests = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/contests");
            const data = await res.json();
            if (Array.isArray(data)) setContests(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchContests(); }, []);

    useEffect(() => {
        if (showCreate && allProblems.length === 0) {
            fetch("/api/problems").then(r => r.json()).then(d => {
                if (Array.isArray(d)) setAllProblems(d);
            });
        }
    }, [showCreate]);

    const toggleProblem = (id: string) => {
        setSelectedProblems(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const handleCreate = async () => {
        if (!form.title || !form.startTime || !selectedProblems.length) {
            setCreateMsg({ type: "error", text: "Title, start time, and at least one problem are required" });
            return;
        }
        setCreating(true);
        setCreateMsg(null);
        try {
            const res = await fetch("/api/contests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description,
                    problemIds: selectedProblems,
                    startTime: form.startTime,
                    duration: parseInt(form.duration),
                    isPublic: form.isPublic,
                    maxParticipants: parseInt(form.maxParticipants),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setCreateMsg({ type: "success", text: `Contest "${form.title}" created!` });
                setShowCreate(false);
                setForm({ title: "", description: "", duration: "60", startTime: "", isPublic: true, maxParticipants: "50" });
                setSelectedProblems([]);
                fetchContests();
            } else {
                setCreateMsg({ type: "error", text: data.error || "Failed to create" });
            }
        } catch (e: any) {
            setCreateMsg({ type: "error", text: e.message });
        } finally {
            setCreating(false);
        }
    };

    const handleJoin = async (id: string) => {
        if (!isSignedIn) return;
        setJoiningId(id);
        try {
            const res = await fetch(`/api/contests/${id}?action=join`, { method: "POST" });
            const data = await res.json();
            if (data.success) fetchContests();
        } finally {
            setJoiningId(null);
        }
    };

    const filtered = contests.filter(c =>
        activeTab === "all" ? true : c.status === activeTab
    );

    const tabs: { key: typeof activeTab; label: string }[] = [
        { key: "all", label: "All" },
        { key: "active", label: "Live" },
        { key: "upcoming", label: "Upcoming" },
        { key: "ended", label: "Ended" },
    ];

    return (
        <div className="container max-w-screen-xl mx-auto py-10 px-4 space-y-8">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Trophy className="w-7 h-7 text-primary" />
                        Contests
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Compete in timed DataWeave coding contests.
                    </p>
                </div>
                {isSignedIn ? (
                    <Button onClick={() => setShowCreate(!showCreate)} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Create Contest
                    </Button>
                ) : (
                    <SignInButton mode="modal">
                        <Button variant="outline" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Create Contest
                        </Button>
                    </SignInButton>
                )}
            </div>

            {/* Create form */}
            {showCreate && (
                <Card className="border-primary/30">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Plus className="w-4 h-4 text-primary" />
                            New Contest
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Title *</label>
                                <Input placeholder="Weekly DW Challenge #1" value={form.title}
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Start Time *</label>
                                <Input type="datetime-local" value={form.startTime}
                                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Duration (minutes)</label>
                                <Select value={form.duration} onValueChange={v => v && setForm(f => ({ ...f, duration: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[30, 60, 90, 120, 180].map(d => (
                                            <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Max Participants</label>
                                <Input type="number" min={2} max={500} value={form.maxParticipants}
                                    onChange={e => setForm(f => ({ ...f, maxParticipants: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
                            <Textarea placeholder="Brief description of this contest…" rows={2} value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                        </div>

                        {/* Problem picker */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Problems * <span className="text-muted-foreground font-normal">({selectedProblems.length} selected)</span>
                            </label>
                            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                                {allProblems.length === 0 ? (
                                    <p className="text-xs text-muted-foreground p-3">Loading problems…</p>
                                ) : allProblems.map(p => (
                                    <label key={p._id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 accent-primary"
                                            checked={selectedProblems.includes(p._id)}
                                            onChange={() => toggleProblem(p._id)}
                                        />
                                        <span className="text-sm flex-1">{p.title}</span>
                                        <Badge variant="outline" className={`text-[10px] py-0 ${p.difficulty === "Easy" ? "text-green-500 border-green-500/30" :
                                            p.difficulty === "Medium" ? "text-yellow-500 border-yellow-500/30" :
                                                "text-red-500 border-red-500/30"
                                            }`}>{p.difficulty}</Badge>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {createMsg && (
                            <p className={`text-sm ${createMsg.type === "success" ? "text-green-500" : "text-red-500"}`}>
                                {createMsg.text}
                            </p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                            <Button onClick={handleCreate} disabled={creating}>
                                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                                Create Contest
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tabs */}
            <div className="flex gap-1.5 flex-wrap">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={cn(
                            "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                            activeTab === t.key
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/40 text-muted-foreground hover:bg-muted"
                        )}
                    >
                        {t.label}
                        <span className="ml-1.5 text-xs opacity-70">
                            {t.key === "all" ? contests.length : contests.filter(c => c.status === t.key).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Contest cards */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading contests…
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No {activeTab === "all" ? "" : activeTab} contests yet.</p>
                    {isSignedIn && (
                        <Button variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
                            Create the first one
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map(c => {
                        const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.ended;
                        const isParticipant = false; // would need userId check client-side
                        return (
                            <Card key={c._id} className={cn(
                                "relative overflow-hidden transition-shadow hover:shadow-md",
                                c.status === "active" ? "ring-1 ring-green-500/30" : ""
                            )}>
                                {c.status === "active" && (
                                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-green-500/0 via-green-500 to-green-500/0" />
                                )}
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <CardTitle className="text-base leading-snug">{c.title}</CardTitle>
                                            <CardDescription className="text-xs mt-1">by {c.createdByName}</CardDescription>
                                        </div>
                                        <Badge className={`text-xs shrink-0 border ${cfg.bg} ${cfg.color}`}>
                                            {c.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block animate-pulse" />}
                                            {cfg.label}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {c.description && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                                    )}

                                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {formatDate(c.startTime)}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            {c.duration} min
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5" />
                                            {c.participantCount}/{c.maxParticipants}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {c.isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                            {c.isPublic ? "Public" : "Private"}
                                        </div>
                                    </div>

                                    {/* Time left */}
                                    {c.status === "active" && (
                                        <div className="flex items-center gap-1.5 text-xs bg-green-500/10 text-green-500 rounded-md px-2.5 py-1.5 border border-green-500/20">
                                            <Clock className="w-3.5 h-3.5" />
                                            Time left: <TimeLeft endTime={c.endTime} status={c.status} />
                                        </div>
                                    )}
                                    {c.status === "upcoming" && (
                                        <div className="flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-500 rounded-md px-2.5 py-1.5 border border-blue-500/20">
                                            <Clock className="w-3.5 h-3.5" />
                                            Starts: {formatDate(c.startTime)}
                                        </div>
                                    )}

                                    {/* Problem badges */}
                                    <div className="flex flex-wrap gap-1">
                                        {(c.problems || []).slice(0, 4).map((p: any) => (
                                            <Badge key={p.slug || p._id} variant="outline" className="text-[10px] py-0">
                                                {p.title?.length > 20 ? p.title.slice(0, 20) + "…" : p.title}
                                            </Badge>
                                        ))}
                                        {(c.problems || []).length > 4 && (
                                            <Badge variant="outline" className="text-[10px] py-0">
                                                +{(c.problems || []).length - 4} more
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 pt-1">
                                        <Link href={`/contests/${c._id}`} className="flex-1">
                                            <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1">
                                                View <ChevronRight className="w-3.5 h-3.5" />
                                            </Button>
                                        </Link>
                                        {c.status !== "ended" && isSignedIn && (
                                            <Button
                                                size="sm"
                                                className="h-8 text-xs gap-1"
                                                disabled={joiningId === c._id}
                                                onClick={() => handleJoin(c._id)}
                                            >
                                                {joiningId === c._id
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <Check className="w-3 h-3" />}
                                                Join
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
