"use client";

/**
 * ProductTour — first-time user walkthrough.
 *
 * Triggers once when a signed-in user lands on the site and hasn't
 * dismissed the tour yet. State is persisted in localStorage under
 * "dwcode_tour_done" so it only ever shows once per browser.
 *
 * No external dependency — built with a portal + CSS transitions.
 */

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
    Code2,
    Terminal,
    BookOpen,
    Trophy,
    Swords,
    ArrowRight,
    X,
    Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Tour steps ───────────────────────────────────────────────────────────────

const STEPS = [
    {
        icon: <Sparkles className="w-8 h-8 text-primary" />,
        title: "Welcome to DWCode 🎉",
        description:
            "The DataWeave practice platform. Sharpen your skills with real problems, compete in contests, and learn from the community.",
        cta: null,
        accent: "from-primary/10 via-primary/5 to-transparent",
    },
    {
        icon: <Code2 className="w-8 h-8 text-green-500" />,
        title: "Solve Problems",
        description:
            "Browse a growing library of DataWeave problems across Easy, Medium, and Hard difficulty. Submit your solution and get instant feedback.",
        cta: { label: "Browse Problems", href: "/problems" },
        accent: "from-green-500/10 via-green-500/5 to-transparent",
    },
    {
        icon: <Terminal className="w-8 h-8 text-blue-500" />,
        title: "Playground",
        description:
            "Experiment freely with the live DataWeave editor. Write scripts, test transformations, and share your code snippets with a single link.",
        cta: { label: "Open Playground", href: "/playground" },
        accent: "from-blue-500/10 via-blue-500/5 to-transparent",
    },
    {
        icon: <Swords className="w-8 h-8 text-yellow-500" />,
        title: "Contests",
        description:
            "Join timed contests to put your skills to the test. Compete against other developers and climb the leaderboard.",
        cta: { label: "View Contests", href: "/contests" },
        accent: "from-yellow-500/10 via-yellow-500/5 to-transparent",
    },
    {
        icon: <BookOpen className="w-8 h-8 text-purple-500" />,
        title: "Community Blog",
        description:
            "Read tips and tutorials written by the community — or share your own knowledge and earn coins for every post you publish.",
        cta: { label: "Visit Blog", href: "/blog" },
        accent: "from-purple-500/10 via-purple-500/5 to-transparent",
    },
    {
        icon: <Trophy className="w-8 h-8 text-orange-400" />,
        title: "Leaderboard & Coins",
        description:
            "Every problem you solve earns you score points and coins. Use coins in the store, and watch your rank rise on the leaderboard.",
        cta: { label: "See Leaderboard", href: "/leaderboard" },
        accent: "from-orange-400/10 via-orange-400/5 to-transparent",
    },
] as const;

const STORAGE_KEY = "dwcode_tour_done";

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductTour() {
    const { isSignedIn } = useAuth();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [exiting, setExiting] = useState(false);

    // Show tour once per browser for signed-in users
    useEffect(() => {
        if (!isSignedIn) return;
        try {
            if (!localStorage.getItem(STORAGE_KEY)) {
                setOpen(true);
            }
        } catch {
            // localStorage unavailable (SSR / private mode) — skip silently
        }
    }, [isSignedIn]);

    const dismiss = useCallback(() => {
        setExiting(true);
        setTimeout(() => {
            setOpen(false);
            setExiting(false);
            try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
        }, 180);
    }, []);

    const next = useCallback(() => {
        if (step < STEPS.length - 1) {
            setStep((s) => s + 1);
        } else {
            dismiss();
        }
    }, [step, dismiss]);

    const prev = useCallback(() => {
        if (step > 0) setStep((s) => s - 1);
    }, [step]);

    if (!open) return null;

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    return (
        /* Backdrop */
        <div
            className={cn(
                "fixed inset-0 z-[9998] flex items-center justify-center px-4",
                "bg-black/50 backdrop-blur-sm",
                "transition-opacity duration-200",
                exiting ? "opacity-0" : "opacity-100"
            )}
            onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
            role="dialog"
            aria-modal="true"
            aria-label="Product tour"
        >
            {/* Card */}
            <div
                className={cn(
                    "relative w-full max-w-md rounded-2xl border bg-card shadow-2xl overflow-hidden",
                    "transition-all duration-200",
                    exiting ? "opacity-0 scale-95" : "opacity-100 scale-100"
                )}
            >
                {/* Gradient accent bar */}
                <div className={cn("absolute inset-x-0 top-0 h-32 bg-gradient-to-b opacity-60", current.accent)} />

                {/* Close */}
                <button
                    onClick={dismiss}
                    aria-label="Skip tour"
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Content */}
                <div className="relative px-8 pt-10 pb-8 space-y-5 text-center">
                    {/* Icon */}
                    <div className="flex justify-center">
                        <div className="p-4 rounded-2xl bg-background/80 border shadow-sm">
                            {current.icon}
                        </div>
                    </div>

                    {/* Text */}
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold tracking-tight">{current.title}</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {current.description}
                        </p>
                    </div>

                    {/* CTA link */}
                    {current.cta && (
                        <Link
                            href={current.cta.href}
                            onClick={dismiss}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        >
                            {current.cta.label}
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    )}

                    {/* Progress dots */}
                    <div className="flex justify-center gap-1.5 pt-1">
                        {STEPS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setStep(i)}
                                aria-label={`Go to step ${i + 1}`}
                                className={cn(
                                    "rounded-full transition-all duration-200",
                                    i === step
                                        ? "w-5 h-2 bg-primary"
                                        : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                                )}
                            />
                        ))}
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={prev}
                            disabled={step === 0}
                            className="text-xs text-muted-foreground"
                        >
                            ← Back
                        </Button>

                        <button
                            onClick={dismiss}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Skip tour
                        </button>

                        <Button size="sm" onClick={next} className="gap-1 text-xs">
                            {isLast ? "Get started" : "Next"}
                            {!isLast && <ArrowRight className="w-3 h-3" />}
                        </Button>
                    </div>
                </div>

                {/* Step counter */}
                <div className="border-t px-8 py-2.5 flex items-center justify-center">
                    <span className="text-[11px] text-muted-foreground">
                        Step {step + 1} of {STEPS.length}
                    </span>
                </div>
            </div>
        </div>
    );
}
