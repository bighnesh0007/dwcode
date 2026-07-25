"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Check, Heart, Info, Loader2, ShieldCheck, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError, apiRequest } from "@/lib/apiClient";
import type {
    CreatedOrder, PublicSponsor, SponsorshipConfig,
} from "@/lib/apiTypes";

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** Minimal shape of the Razorpay checkout global we rely on. */
interface RazorpayHandlerResponse {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}
interface RazorpayInstance {
    open: () => void;
    on: (event: string, handler: (response: unknown) => void) => void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
    interface Window {
        Razorpay?: RazorpayConstructor;
    }
}

/** Load the checkout script once, on demand. */
function loadRazorpayScript(): Promise<boolean> {
    if (typeof window === "undefined") return Promise.resolve(false);
    if (window.Razorpay) return Promise.resolve(true);

    return new Promise((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT}"]`);
        if (existing) {
            existing.addEventListener("load", () => resolve(true), { once: true });
            existing.addEventListener("error", () => resolve(false), { once: true });
            return;
        }
        const script = document.createElement("script");
        script.src = RAZORPAY_SCRIPT;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

/** paise → a readable amount. */
function formatAmount(minorUnits: number, currency: string): string {
    const major = minorUnits / 100;
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
        }).format(major);
    } catch {
        return `${currency} ${major.toLocaleString()}`;
    }
}

type Status =
    | { kind: "idle" }
    | { kind: "working"; label: string }
    | { kind: "done" }
    | { kind: "error"; message: string };

export default function SponsorPage() {
    const { isSignedIn, getToken } = useAuth();
    const { user } = useUser();

    const [config, setConfig] = useState<SponsorshipConfig | null>(null);
    const [sponsors, setSponsors] = useState<PublicSponsor[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [selectedTier, setSelectedTier] = useState<string | null>(null);
    const [customAmount, setCustomAmount] = useState("");
    const [sponsorName, setSponsorName] = useState("");
    const [message, setMessage] = useState("");
    const [showPublicly, setShowPublicly] = useState(true);
    const [status, setStatus] = useState<Status>({ kind: "idle" });

    // ── Load config + sponsor wall ────────────────────────────────────────────
    useEffect(() => {
        queueMicrotask(() => {
            void (async () => {
                try {
                    const cfg = await apiRequest<SponsorshipConfig>("/api/v1/sponsorship/config");
                    setConfig(cfg);
                    setSelectedTier(cfg.tiers[1]?.id ?? cfg.tiers[0]?.id ?? null);
                } catch (e) {
                    setLoadError(
                        e instanceof ApiError
                            ? e.message
                            : "Could not reach the DWCode backend. Is the server running?",
                    );
                } finally {
                    setLoading(false);
                }

                try {
                    const result = await apiRequest<{ sponsors: PublicSponsor[] }>(
                        "/api/v1/sponsorship/sponsors?limit=24",
                    );
                    setSponsors(result.sponsors);
                } catch {
                    /* the wall is optional — never block the page on it */
                }
            })();
        });
    }, []);

    // Prefill the display name once Clerk resolves.
    useEffect(() => {
        if (user && !sponsorName) {
            queueMicrotask(() => setSponsorName(user.fullName ?? user.username ?? ""));
        }
    }, [user, sponsorName]);

    const amountMinor = useMemo(() => {
        if (selectedTier === "custom") {
            const major = Number(customAmount);
            return Number.isFinite(major) && major > 0 ? Math.round(major * 100) : 0;
        }
        return config?.tiers.find((t) => t.id === selectedTier)?.amount ?? 0;
    }, [selectedTier, customAmount, config]);

    const amountValid =
        config !== null &&
        Number.isInteger(amountMinor) &&
        amountMinor >= config.minAmount &&
        amountMinor <= config.maxAmount;

    const sponsor = useCallback(async () => {
        if (!config?.enabled || !amountValid) return;

        setStatus({ kind: "working", label: "Preparing your order…" });
        try {
            const token = isSignedIn ? await getToken() : null;

            const order = await apiRequest<CreatedOrder>("/api/v1/sponsorship/orders", {
                method: "POST",
                token,
                body: {
                    amount: amountMinor,
                    ...(sponsorName.trim() ? { sponsorName: sponsorName.trim() } : {}),
                    ...(message.trim() ? { message: message.trim() } : {}),
                    showPublicly,
                },
            });

            setStatus({ kind: "working", label: "Opening checkout…" });
            const ready = await loadRazorpayScript();
            if (!ready || !window.Razorpay) {
                throw new Error("Could not load the Razorpay checkout script.");
            }

            const checkout = new window.Razorpay({
                key: order.keyId,
                order_id: order.orderId,
                amount: order.amount,
                currency: order.currency,
                name: "DWCode",
                description: "Sponsorship",
                prefill: {
                    ...(sponsorName.trim() ? { name: sponsorName.trim() } : {}),
                    ...(user?.primaryEmailAddress?.emailAddress
                        ? { email: user.primaryEmailAddress.emailAddress }
                        : {}),
                },
                theme: { color: "#7c5cff" },
                // The browser's success callback is only a hint about WHICH order to
                // check — the backend re-verifies the signature before recording
                // anything, so a forged call here achieves nothing.
                handler: (response: RazorpayHandlerResponse) => {
                    setStatus({ kind: "working", label: "Verifying payment…" });
                    void (async () => {
                        try {
                            await apiRequest("/api/v1/sponsorship/verify", {
                                method: "POST",
                                token: isSignedIn ? await getToken() : null,
                                body: {
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_signature: response.razorpay_signature,
                                },
                            });
                            setStatus({ kind: "done" });
                        } catch (e) {
                            setStatus({
                                kind: "error",
                                message:
                                    e instanceof ApiError
                                        ? `Payment could not be verified: ${e.message}`
                                        : "Payment could not be verified.",
                            });
                        }
                    })();
                },
                modal: {
                    ondismiss: () => setStatus({ kind: "idle" }),
                },
            });

            checkout.on("payment.failed", () => {
                setStatus({ kind: "error", message: "The payment failed. Nothing was charged." });
            });

            checkout.open();
        } catch (e) {
            setStatus({
                kind: "error",
                message:
                    e instanceof ApiError
                        ? e.code === "NOT_CONFIGURED"
                            ? "Sponsorship is not configured on this server yet."
                            : e.message
                        : e instanceof Error
                            ? e.message
                            : "Something went wrong.",
            });
        }
    }, [config, amountValid, amountMinor, sponsorName, message, showPublicly, isSignedIn, getToken, user]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-32 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-screen-lg space-y-8 px-4 py-10">
            <div className="space-y-2 text-center">
                <h1 className="flex items-center justify-center gap-3 text-3xl font-bold tracking-tight">
                    <Heart className="h-7 w-7 fill-current text-red-500" />
                    Sponsor DWCode
                </h1>
                <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
                    DWCode is free and open source. Sponsorship covers the compiler backend,
                    database and hosting — and keeps it that way for every Muley.
                </p>
            </div>

            {loadError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                    {loadError}
                </div>
            )}

            {config && !config.enabled && (
                <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                    <div>
                        <p className="font-medium text-foreground">Sponsorship isn&apos;t live yet</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Payments are switched off until the server is configured with Razorpay
                            credentials. In the meantime you can support the project by starring the
                            repository or contributing a problem.
                        </p>
                    </div>
                </div>
            )}

            {status.kind === "done" ? (
                <Card className="border-green-500/30 bg-green-500/5">
                    <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15">
                            <Check className="h-6 w-6 text-green-500" />
                        </div>
                        <h2 className="text-xl font-semibold">Thank you! 💜</h2>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            Your sponsorship is confirmed. It genuinely keeps this project running.
                        </p>
                        <div className="mt-2 flex gap-2">
                            <Link href="/problems"><Button variant="outline" size="sm">Back to problems</Button></Link>
                            <Button size="sm" onClick={() => setStatus({ kind: "idle" })}>
                                Sponsor again
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-5">
                    {/* Amount + details */}
                    <Card className="md:col-span-3">
                        <CardHeader>
                            <CardTitle className="text-base">Choose an amount</CardTitle>
                            <CardDescription className="text-xs">
                                One-off payment. Cards, UPI, netbanking and wallets via Razorpay.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {config?.tiers.map((tier) => (
                                    <button
                                        key={tier.id}
                                        type="button"
                                        onClick={() => setSelectedTier(tier.id)}
                                        className={cn(
                                            "rounded-lg border px-3 py-3 text-center transition-colors",
                                            selectedTier === tier.id
                                                ? "border-primary bg-primary/10"
                                                : "hover:bg-accent",
                                        )}
                                    >
                                        <span className="block text-sm font-semibold">
                                            {formatAmount(tier.amount, config.currency)}
                                        </span>
                                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                            {tier.label}
                                        </span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setSelectedTier("custom")}
                                    className={cn(
                                        "rounded-lg border px-3 py-3 text-center transition-colors",
                                        selectedTier === "custom"
                                            ? "border-primary bg-primary/10"
                                            : "hover:bg-accent",
                                    )}
                                >
                                    <span className="block text-sm font-semibold">Custom</span>
                                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                        your choice
                                    </span>
                                </button>
                            </div>

                            {selectedTier === "custom" && config && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="amount" className="text-xs">
                                        Amount ({config.currency})
                                    </Label>
                                    <Input
                                        id="amount"
                                        inputMode="numeric"
                                        placeholder={String(config.minAmount / 100)}
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d.]/g, ""))}
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Between {formatAmount(config.minAmount, config.currency)} and{" "}
                                        {formatAmount(config.maxAmount, config.currency)}.
                                    </p>
                                </div>
                            )}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="name" className="text-xs">Display name (optional)</Label>
                                    <Input
                                        id="name"
                                        maxLength={80}
                                        placeholder="Anonymous"
                                        value={sponsorName}
                                        onChange={(e) => setSponsorName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="msg" className="text-xs">Message (optional)</Label>
                                    <Textarea
                                        id="msg"
                                        maxLength={280}
                                        rows={2}
                                        placeholder="Keep weaving!"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                    />
                                </div>
                            </div>

                            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                                <input
                                    type="checkbox"
                                    className="accent-primary"
                                    checked={showPublicly}
                                    onChange={(e) => setShowPublicly(e.target.checked)}
                                />
                                Show my name on the sponsor wall
                            </label>

                            {status.kind === "error" && (
                                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
                                    {status.message}
                                </div>
                            )}

                            <Button
                                className="w-full gap-2"
                                disabled={
                                    !config?.enabled || !amountValid || status.kind === "working"
                                }
                                onClick={() => void sponsor()}
                            >
                                {status.kind === "working" ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" />{status.label}</>
                                ) : (
                                    <>
                                        <Heart className="h-4 w-4" />
                                        Sponsor{amountValid && config
                                            ? ` ${formatAmount(amountMinor, config.currency)}`
                                            : ""}
                                    </>
                                )}
                            </Button>

                            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                                <ShieldCheck className="h-3 w-3" />
                                Payments handled by Razorpay. Every payment is verified server-side.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Sponsor wall */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Sparkles className="h-4 w-4 text-primary" /> Sponsors
                            </CardTitle>
                            <CardDescription className="text-xs">
                                People keeping DWCode online.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {sponsors.length === 0 ? (
                                <p className="py-6 text-center text-xs italic text-muted-foreground">
                                    No sponsors yet — be the first. 💜
                                </p>
                            ) : (
                                <ul className="space-y-3">
                                    {sponsors.map((s, i) => (
                                        <li key={`${s.sponsorName}-${i}`} className="flex items-start gap-2">
                                            <Heart className="mt-0.5 h-3 w-3 shrink-0 fill-current text-red-500" />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{s.sponsorName}</p>
                                                {s.message && (
                                                    <p className="text-xs text-muted-foreground">{s.message}</p>
                                                )}
                                            </div>
                                            <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                                                {formatAmount(s.amount, config?.currency ?? "INR")}
                                            </Badge>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
