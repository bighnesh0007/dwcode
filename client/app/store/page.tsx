"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Check, Coins, Eye, Loader2, Lock, Palette, ShoppingBag, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSkin } from "@/components/SkinProvider";
import { DEFAULT_SKIN, type ThemeSkin } from "@/lib/themes";
import { getErrorMessage } from "@/lib/errors";

interface StoreResponse {
    items: ThemeSkin[];
    owned: string[];
    balance: number;
    signedIn: boolean;
}

const CATEGORY_ORDER: ThemeSkin["category"][] = ["Free", "Classic", "Vivid", "Premium"];

/** Miniature preview of a skin's palette, drawn from its swatch colours. */
function Swatch({ colors }: { colors: ThemeSkin["swatch"] }) {
    const [primary, accent, surface] = colors;
    return (
        <div
            className="relative h-20 w-full overflow-hidden rounded-lg border"
            style={{ background: surface }}
            aria-hidden
        >
            <div className="absolute inset-0 flex items-end gap-1.5 p-3">
                <span className="h-3 w-16 rounded-full" style={{ background: primary }} />
                <span className="h-3 w-8 rounded-full opacity-80" style={{ background: accent }} />
            </div>
            <div className="absolute right-3 top-3 flex gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: primary }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
            </div>
        </div>
    );
}

export default function StorePage() {
    const { isSignedIn } = useAuth();
    const { activeSkin, previewSkin, startPreview, cancelPreview, applySkin } = useSkin();

    const [data, setData] = useState<StoreResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/store");
            if (!res.ok) throw new Error("Could not load the store.");
            const json: StoreResponse = await res.json();
            setData(json);
        } catch (e) {
            setError(getErrorMessage(e, "Could not load the store."));
        } finally {
            setLoading(false);
        }
    }, []);

    // queueMicrotask keeps the state updates out of the synchronous effect body.
    useEffect(() => {
        queueMicrotask(() => void load());
    }, [load, isSignedIn]);

    const owned = useMemo(() => new Set(data?.owned ?? [DEFAULT_SKIN]), [data]);
    const balance = data?.balance ?? 0;

    const buy = async (item: ThemeSkin) => {
        setBusyId(item.id);
        setError(null);
        try {
            const res = await fetch("/api/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId: item.id }),
            });
            const json: unknown = await res.json();
            if (!res.ok) {
                const message =
                    typeof json === "object" && json !== null && "error" in json
                        ? String(json.error)
                        : "Purchase failed.";
                throw new Error(message);
            }
            await load();
            // Buying is an explicit choice of theme, so equip it right away.
            applySkin(item.id);
        } catch (e) {
            setError(getErrorMessage(e, "Purchase failed."));
        } finally {
            setBusyId(null);
        }
    };

    const grouped = useMemo(() => {
        const items = data?.items ?? [];
        return CATEGORY_ORDER.map((category) => ({
            category,
            items: items.filter((i) => i.category === category),
        })).filter((g) => g.items.length > 0);
    }, [data]);

    return (
        <div className="container mx-auto max-w-screen-xl space-y-8 px-4 py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
                        <ShoppingBag className="h-7 w-7 text-primary" />
                        Theme Store
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Spend the coins you earn solving problems. Try any theme free before you buy.
                    </p>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-semibold text-yellow-500">
                    <Coins className="h-4 w-4" />
                    {loading ? "…" : balance.toLocaleString()}
                    <span className="font-normal text-muted-foreground">coins</span>
                </div>
            </div>

            {!isSignedIn && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                        You can preview every theme without an account — sign in to earn coins and keep one.
                    </span>
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" /> Loading store…
                </div>
            ) : (
                grouped.map((group) => (
                    <section key={group.category} className="space-y-4">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/70">
                                {group.category}
                            </h2>
                            <span className="text-xs text-muted-foreground">{group.items.length}</span>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {group.items.map((item) => {
                                const isOwned = owned.has(item.id);
                                const isActive = activeSkin === item.id && !previewSkin;
                                const isPreviewing = previewSkin === item.id;
                                const affordable = balance >= item.cost;
                                const busy = busyId === item.id;

                                return (
                                    <Card
                                        key={item.id}
                                        className={cn(
                                            "flex flex-col transition-all",
                                            isActive && "ring-2 ring-primary",
                                            isPreviewing && "ring-2 ring-primary/50",
                                        )}
                                    >
                                        <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                                            <Swatch colors={item.swatch} />

                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <h3 className="flex items-center gap-1.5 font-semibold">
                                                        <Palette className="h-3.5 w-3.5 text-primary" />
                                                        {item.name}
                                                    </h3>
                                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                        {item.description}
                                                    </p>
                                                </div>
                                                {isActive ? (
                                                    <Badge className="shrink-0 border border-green-500/30 bg-green-500/10 text-[10px] text-green-500">
                                                        <Check className="mr-1 h-2.5 w-2.5" />Active
                                                    </Badge>
                                                ) : item.cost === 0 ? (
                                                    <Badge variant="outline" className="shrink-0 text-[10px]">Free</Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="shrink-0 gap-1 text-[10px] text-yellow-500"
                                                    >
                                                        <Coins className="h-2.5 w-2.5" />{item.cost}
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="mt-auto flex items-center gap-2 pt-1">
                                                {isPreviewing ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="flex-1 text-xs"
                                                        onClick={cancelPreview}
                                                    >
                                                        Stop preview
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="flex-1 gap-1 text-xs"
                                                        onClick={() => startPreview(item.id)}
                                                        disabled={isActive}
                                                    >
                                                        <Eye className="h-3 w-3" /> Try
                                                    </Button>
                                                )}

                                                {isOwned ? (
                                                    <Button
                                                        size="sm"
                                                        className="flex-1 text-xs"
                                                        onClick={() => applySkin(item.id)}
                                                        disabled={isActive}
                                                    >
                                                        {isActive ? "Applied" : "Apply"}
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        className="flex-1 gap-1 text-xs"
                                                        onClick={() => void buy(item)}
                                                        disabled={busy || !isSignedIn || !affordable}
                                                        title={
                                                            !isSignedIn
                                                                ? "Sign in to buy"
                                                                : !affordable
                                                                    ? `Needs ${item.cost - balance} more coins`
                                                                    : `Buy for ${item.cost} coins`
                                                        }
                                                    >
                                                        {busy ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : !affordable || !isSignedIn ? (
                                                            <Lock className="h-3 w-3" />
                                                        ) : (
                                                            <Coins className="h-3 w-3" />
                                                        )}
                                                        {busy ? "Buying…" : "Buy"}
                                                    </Button>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}

            <p className="border-t pt-6 text-xs text-muted-foreground">
                Earn coins by solving problems (5–20 per solve, plus a 10-coin first-solve bonus),
                writing blog posts and commenting. See your balance and history on your{" "}
                <Link href="/profile" className="text-primary underline underline-offset-2">
                    profile
                </Link>
                .
            </p>
        </div>
    );
}
