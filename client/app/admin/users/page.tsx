"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ArrowLeft, Coins, Crown, Database, Loader2, MessageSquare, Search,
    Shield, ShieldOff, Trophy, UserX, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UserRow {
    userId: string;
    userName: string;
    userImageUrl: string;
    username: string | null;
    totalSubmissions: number;
    accepted: number;
    solvedCount: number;
    commentCount: number;
    coins: number;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    hasProfile: boolean;
    joinedAt: string | null;
    lastActiveAt: string | null;
}

interface AdminUsersResponse {
    users: UserRow[];
    isSuperAdmin: boolean;
    counts: { total: number; withProfile: number; active: number; admins: number };
}

type Tab = "all" | "active" | "inactive" | "admins";

const TABS: { id: Tab; label: string; hint: string }[] = [
    { id: "all", label: "All", hint: "Every known user" },
    { id: "active", label: "Active", hint: "Has at least one submission" },
    { id: "inactive", label: "Never submitted", hint: "Signed up but never submitted code" },
    { id: "admins", label: "Admins", hint: "Admin or super-admin" },
];

function formatDate(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "2-digit",
    });
}

function relativeTime(value: string | null): string {
    if (!value) return "never";
    const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

export default function AdminUsersPage() {
    const { isSignedIn } = useAuth();
    const [data, setData] = useState<AdminUsersResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState<Tab>("all");
    const [actionId, setActionId] = useState<string | null>(null);

    // `setLoading` lives inside the loader rather than in a `.finally()` on the
    // effect, so the effect body itself performs no state updates.
    const loadUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (res.status === 403) {
                setForbidden(true);
                return;
            }
            setData((await res.json()) as AdminUsersResponse);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isSignedIn) return;
        void loadUsers();
    }, [isSignedIn, loadUsers]);

    const setRole = async (user: UserRow, grant: boolean) => {
        setActionId(user.userId);
        try {
            await (grant
                ? fetch("/api/admin/roles", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ targetUserId: user.userId, targetUserName: user.userName }),
                })
                : fetch(`/api/admin/roles?userId=${encodeURIComponent(user.userId)}`, { method: "DELETE" }));
            await loadUsers();
        } finally {
            setActionId(null);
        }
    };

    const users = useMemo(() => data?.users ?? [], [data]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users
            .filter((u) => {
                if (tab === "active") return u.totalSubmissions > 0;
                if (tab === "inactive") return u.totalSubmissions === 0;
                if (tab === "admins") return u.isAdmin;
                return true;
            })
            .filter((u) =>
                !q ||
                u.userName.toLowerCase().includes(q) ||
                u.userId.toLowerCase().includes(q) ||
                (u.username ?? "").toLowerCase().includes(q),
            );
    }, [users, tab, search]);

    if (!isSignedIn) {
        return (
            <div className="flex items-center justify-center py-32 text-muted-foreground">
                Sign in to access this page.
            </div>
        );
    }

    if (forbidden) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-32 text-muted-foreground">
                <ShieldOff className="h-10 w-10 opacity-30" />
                <p>Access denied. Admin only.</p>
                <Link href="/"><Button variant="outline">Go Home</Button></Link>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-32 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading users…
            </div>
        );
    }

    const counts = data?.counts ?? { total: 0, withProfile: 0, active: 0, admins: 0 };
    const columnCount = data?.isSuperAdmin ? 8 : 7;

    const summary = [
        { label: "Total Users", value: counts.total, icon: <Users className="h-4 w-4" />, color: "text-primary" },
        { label: "Active (submitted)", value: counts.active, icon: <Trophy className="h-4 w-4" />, color: "text-green-500" },
        { label: "Never Submitted", value: counts.total - counts.active, icon: <UserX className="h-4 w-4" />, color: "text-orange-500" },
        { label: "Coins Distributed", value: users.reduce((a, u) => a + u.coins, 0), icon: <Coins className="h-4 w-4" />, color: "text-yellow-500" },
    ];

    return (
        <div className="container mx-auto max-w-screen-xl space-y-8 px-4 py-10">
            <Link href="/admin" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to Admin
            </Link>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
                        <Users className="h-6 w-6 text-primary" /> User Management
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {counts.total} users · {counts.active} active · {counts.admins} admin
                        {counts.admins === 1 ? "" : "s"}
                    </p>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search name, @username or user ID…"
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {summary.map((s) => (
                    <Card key={s.label}>
                        <CardContent className="pb-3 pt-4">
                            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                                {s.icon}
                                {s.label}
                            </div>
                            <div className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1.5 border-b pb-2">
                {TABS.map((t) => {
                    const n =
                        t.id === "all" ? counts.total
                        : t.id === "active" ? counts.active
                        : t.id === "inactive" ? counts.total - counts.active
                        : counts.admins;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            title={t.hint}
                            onClick={() => setTab(t.id)}
                            className={cn(
                                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                                tab === t.id
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                        >
                            {t.label}
                            <span className="ml-1.5 opacity-60">{n}</span>
                        </button>
                    );
                })}
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                        {TABS.find((t) => t.id === tab)?.label} — {filtered.length}
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Users are collected from profiles, submissions, comments, coin balances and roles —
                        so someone who signed up but never submitted still appears here.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                                    <th className="px-4 py-3 text-left font-medium">User</th>
                                    <th className="px-3 py-3 text-center font-medium">Solved</th>
                                    <th className="px-3 py-3 text-center font-medium">Subs</th>
                                    <th className="px-3 py-3 text-center font-medium">Comments</th>
                                    <th className="px-3 py-3 text-center font-medium">Coins</th>
                                    <th className="px-3 py-3 text-center font-medium">Last active</th>
                                    <th className="px-3 py-3 text-center font-medium">Role</th>
                                    {data?.isSuperAdmin && <th className="px-3 py-3 text-center font-medium">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={columnCount} className="px-4 py-12 text-center">
                                            {users.length === 0 ? (
                                                <div className="mx-auto max-w-md space-y-3 text-muted-foreground">
                                                    <Database className="mx-auto h-8 w-8 opacity-30" />
                                                    <p className="font-medium text-foreground">No users in this database</p>
                                                    <p className="text-xs leading-relaxed">
                                                        Nothing was found in profiles, submissions, comments, coins or roles.
                                                        If you expect users here, the app is probably pointed at a different
                                                        database — check <code className="font-mono">MONGODB_URI</code>.
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    No users match this filter.
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((u) => (
                                        <tr
                                            key={u.userId}
                                            className={cn(
                                                "transition-colors hover:bg-muted/20",
                                                u.isAdmin && "bg-blue-500/5",
                                            )}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    {u.userImageUrl ? (
                                                        <Image
                                                            unoptimized
                                                            src={u.userImageUrl}
                                                            width={32}
                                                            height={32}
                                                            className="h-8 w-8 flex-shrink-0 rounded-full"
                                                            alt={u.userName}
                                                        />
                                                    ) : (
                                                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                                                            {(u.userName || "?")[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="flex items-center gap-1.5 truncate font-medium">
                                                            {u.userName}
                                                            {!u.hasProfile && (
                                                                <span
                                                                    title="No UserProfile record — legacy or never completed sign-in"
                                                                    className="rounded bg-orange-500/10 px-1 py-px text-[9px] font-normal text-orange-500"
                                                                >
                                                                    no profile
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                                                            {u.username ? `@${u.username}` : `${u.userId.slice(0, 18)}…`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className={u.solvedCount > 0 ? "font-semibold text-green-500" : "text-muted-foreground"}>
                                                    {u.solvedCount}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                {u.totalSubmissions === 0 ? (
                                                    <span className="text-muted-foreground/50">—</span>
                                                ) : (
                                                    u.totalSubmissions
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                {u.commentCount === 0 ? (
                                                    <span className="text-muted-foreground/50">—</span>
                                                ) : (
                                                    <span className="inline-flex items-center justify-center gap-1">
                                                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                                                        {u.commentCount}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="inline-flex items-center justify-center gap-1 font-semibold text-yellow-500">
                                                    <Coins className="h-3 w-3" />
                                                    {u.coins}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                                                <span title={`Joined ${formatDate(u.joinedAt)}`}>
                                                    {relativeTime(u.lastActiveAt)}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                {u.isSuperAdmin ? (
                                                    <Badge className="border border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-500">
                                                        <Crown className="mr-1 h-2.5 w-2.5" />Super
                                                    </Badge>
                                                ) : u.isAdmin ? (
                                                    <Badge className="border border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-500">
                                                        <Shield className="mr-1 h-2.5 w-2.5" />Admin
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px]">User</Badge>
                                                )}
                                            </td>
                                            {data?.isSuperAdmin && (
                                                <td className="px-3 py-3 text-center">
                                                    {u.isSuperAdmin ? (
                                                        /* The super admin comes from SUPER_ADMIN_USER_ID, not the
                                                           UserRole collection, so there is nothing to revoke. */
                                                        <span
                                                            className="text-[10px] text-muted-foreground"
                                                            title="Set via the SUPER_ADMIN_USER_ID environment variable"
                                                        >
                                                            env-managed
                                                        </span>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className={cn(
                                                                "h-7 text-xs",
                                                                u.isAdmin
                                                                    ? "border-red-500/30 text-red-500 hover:bg-red-500/10"
                                                                    : "border-blue-500/30 text-blue-500 hover:bg-blue-500/10",
                                                            )}
                                                            onClick={() => void setRole(u, !u.isAdmin)}
                                                            disabled={actionId === u.userId}
                                                        >
                                                            {actionId === u.userId ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : u.isAdmin ? (
                                                                <><ShieldOff className="mr-1 h-3 w-3" />Revoke</>
                                                            ) : (
                                                                <><Shield className="mr-1 h-3 w-3" />Grant</>
                                                            )}
                                                        </Button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
