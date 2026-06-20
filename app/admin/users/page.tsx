"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Users, Shield, ShieldOff, Coins, Loader2, Search, CheckCircle2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserRow {
    userId: string;
    userName: string;
    userImageUrl: string;
    totalSubmissions: number;
    accepted: number;
    solvedCount: number;
    commentCount: number;
    coins: number;
    isAdmin: boolean;
    joinedAt: string;
}

export default function AdminUsersPage() {
    const { isSignedIn } = useAuth();
    const [data, setData] = useState<{ users: UserRow[]; isSuperAdmin: boolean } | null>(null);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [search, setSearch] = useState("");
    const [actionId, setActionId] = useState<string | null>(null);

    const fetchUsers = async () => {
        const res = await fetch("/api/admin/users");
        if (res.status === 403) { setForbidden(true); setLoading(false); return; }
        const d = await res.json();
        setData(d);
        setLoading(false);
    };

    useEffect(() => { if (isSignedIn) fetchUsers(); }, [isSignedIn]);

    const grantAdmin = async (user: UserRow) => {
        setActionId(user.userId);
        await fetch("/api/admin/roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetUserId: user.userId, targetUserName: user.userName }),
        });
        await fetchUsers();
        setActionId(null);
    };

    const revokeAdmin = async (user: UserRow) => {
        setActionId(user.userId);
        await fetch(`/api/admin/roles?userId=${user.userId}`, { method: "DELETE" });
        await fetchUsers();
        setActionId(null);
    };

    if (!isSignedIn) return (
        <div className="flex items-center justify-center py-32 text-muted-foreground">
            Sign in to access this page.
        </div>
    );

    if (forbidden) return (
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
            <ShieldOff className="w-10 h-10 opacity-30" />
            <p>Access denied. Admin only.</p>
            <Link href="/"><Button variant="outline">Go Home</Button></Link>
        </div>
    );

    if (loading) return (
        <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading users…
        </div>
    );

    const filtered = (data?.users ?? []).filter(u =>
        u.userName.toLowerCase().includes(search.toLowerCase()) ||
        u.userId.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="container max-w-screen-xl mx-auto py-10 px-4 space-y-8">
            <Link href="/admin" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
                <ArrowLeft className="w-4 h-4" /> Back to Admin
            </Link>

            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                        <Users className="w-6 h-6 text-primary" /> User Management
                    </h1>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        {data?.users.length ?? 0} active users · {data?.users.filter(u => u.isAdmin).length ?? 0} admins
                    </p>
                </div>
                <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Search users…" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>

            {/* Stats summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Total Users", value: data?.users.length ?? 0, icon: <Users className="w-4 h-4" />, color: "text-primary" },
                    { label: "Total Solved", value: data?.users.reduce((a, u) => a + u.solvedCount, 0) ?? 0, icon: <CheckCircle2 className="w-4 h-4" />, color: "text-green-500" },
                    { label: "Total Submissions", value: data?.users.reduce((a, u) => a + u.totalSubmissions, 0) ?? 0, icon: <Trophy className="w-4 h-4" />, color: "text-blue-500" },
                    { label: "Coins Distributed", value: data?.users.reduce((a, u) => a + u.coins, 0) ?? 0, icon: <Coins className="w-4 h-4" />, color: "text-yellow-500" },
                ].map(s => (
                    <Card key={s.label}>
                        <CardContent className="pt-4 pb-3">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{s.icon}{s.label}</div>
                            <div className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Users table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Active Users</CardTitle>
                    <CardDescription className="text-xs">Users who have submitted code or posted comments.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                                    <th className="text-left px-4 py-3 font-medium">User</th>
                                    <th className="text-center px-3 py-3 font-medium">Solved</th>
                                    <th className="text-center px-3 py-3 font-medium">Submissions</th>
                                    <th className="text-center px-3 py-3 font-medium">Comments</th>
                                    <th className="text-center px-3 py-3 font-medium">Coins</th>
                                    <th className="text-center px-3 py-3 font-medium">Joined</th>
                                    <th className="text-center px-3 py-3 font-medium">Role</th>
                                    {data?.isSuperAdmin && <th className="text-center px-3 py-3 font-medium">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No users found.</td></tr>
                                ) : filtered.map(u => (
                                    <tr key={u.userId} className={cn("hover:bg-muted/20 transition-colors", u.isAdmin && "bg-blue-500/3")}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                {u.userImageUrl ? (
                                                    <img src={u.userImageUrl} className="w-8 h-8 rounded-full flex-shrink-0" alt={u.userName} />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                                                        {(u.userName || "?")[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{u.userName}</p>
                                                    <p className="text-[10px] text-muted-foreground font-mono truncate">{u.userId.slice(0, 18)}…</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-center px-3 py-3">
                                            <span className="font-semibold text-green-500">{u.solvedCount}</span>
                                        </td>
                                        <td className="text-center px-3 py-3">{u.totalSubmissions}</td>
                                        <td className="text-center px-3 py-3">{u.commentCount}</td>
                                        <td className="text-center px-3 py-3">
                                            <span className="font-semibold text-yellow-500 flex items-center justify-center gap-1">
                                                <Coins className="w-3 h-3" />{u.coins}
                                            </span>
                                        </td>
                                        <td className="text-center px-3 py-3 text-xs text-muted-foreground">
                                            {u.joinedAt ? new Date(u.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                                        </td>
                                        <td className="text-center px-3 py-3">
                                            {u.isAdmin ? (
                                                <Badge className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/30 border">
                                                    <Shield className="w-2.5 h-2.5 mr-1" />Admin
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px]">User</Badge>
                                            )}
                                        </td>
                                        {data?.isSuperAdmin && (
                                            <td className="text-center px-3 py-3">
                                                {u.isAdmin ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                                                        onClick={() => revokeAdmin(u)}
                                                        disabled={actionId === u.userId}
                                                    >
                                                        {actionId === u.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldOff className="w-3 h-3 mr-1" />}
                                                        Revoke
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-xs text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                                                        onClick={() => grantAdmin(u)}
                                                        disabled={actionId === u.userId}
                                                    >
                                                        {actionId === u.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3 mr-1" />}
                                                        Grant
                                                    </Button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
