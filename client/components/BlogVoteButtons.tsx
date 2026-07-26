"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { cn } from "@/lib/utils";

type VoteValue = 1 | -1 | 0;

interface VoteState {
    upvotes: number;
    downvotes: number;
    myVote: VoteValue;
}

interface VoteResponse {
    upvotes?: number;
    downvotes?: number;
    myVote?: number;
    error?: string;
}

function toVoteValue(value: unknown): VoteValue {
    return value === 1 || value === -1 ? value : 0;
}

/** Pure optimistic transition: apply `next` as this user's vote. */
function applyVote(state: VoteState, next: VoteValue): VoteState {
    return {
        upvotes: state.upvotes + (next === 1 ? 1 : 0) - (state.myVote === 1 ? 1 : 0),
        downvotes: state.downvotes + (next === -1 ? 1 : 0) - (state.myVote === -1 ? 1 : 0),
        myVote: next,
    };
}

interface BlogVoteButtonsProps {
    slug: string;
    initialUpvotes?: number;
    initialDownvotes?: number;
    /** Horizontal, small — for list cards. Default is the detail-page size. */
    compact?: boolean;
}

export function BlogVoteButtons({
    slug,
    initialUpvotes = 0,
    initialDownvotes = 0,
    compact = false,
}: BlogVoteButtonsProps) {
    const { isSignedIn } = useAuth();
    const [state, setState] = useState<VoteState>({
        upvotes: initialUpvotes,
        downvotes: initialDownvotes,
        myVote: 0,
    });
    const [pending, setPending] = useState(false);
    // Monotonic token so a stale request can never clobber a newer one.
    const requestSeq = useRef(0);

    // Fetch this user's vote state once signed-in status is known.
    // setState is deferred via queueMicrotask so it never runs synchronously
    // inside the effect body (see SkinProvider.tsx for the sanctioned pattern).
    useEffect(() => {
        if (!isSignedIn) return;
        const controller = new AbortController();
        // Participate in the same monotonic token as castVote (review finding):
        // if the user votes while this hydration GET is still in flight, and the
        // slow GET lands after the fast POST, its stale payload must not
        // overwrite the confirmed post-vote state.
        const seq = requestSeq.current;
        queueMicrotask(() => {
            void fetch(`/api/blog/${slug}/vote`, { signal: controller.signal })
                .then(r => (r.ok ? (r.json() as Promise<VoteResponse>) : null))
                .then(d => {
                    if (!d || controller.signal.aborted) return;
                    if (seq !== requestSeq.current) return; // a vote superseded us
                    setState({
                        upvotes: d.upvotes ?? 0,
                        downvotes: d.downvotes ?? 0,
                        myVote: toVoteValue(d.myVote),
                    });
                })
                .catch(() => {
                    /* aborted or offline — keep the initial counts */
                });
        });
        return () => {
            controller.abort();
        };
    }, [isSignedIn, slug]);

    const castVote = (direction: 1 | -1) => {
        if (!isSignedIn || pending) return;
        // Clicking the active direction retracts the vote.
        const next: VoteValue = state.myVote === direction ? 0 : direction;
        const previous = state;
        const seq = ++requestSeq.current;

        setState(applyVote(previous, next)); // optimistic
        setPending(true);
        void fetch(`/api/blog/${slug}/vote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: next }),
        })
            .then(r => {
                if (!r.ok) throw new Error("Vote failed");
                return r.json() as Promise<VoteResponse>;
            })
            .then(d => {
                if (seq !== requestSeq.current) return;
                setState({
                    upvotes: d.upvotes ?? 0,
                    downvotes: d.downvotes ?? 0,
                    myVote: toVoteValue(d.myVote),
                });
            })
            .catch(() => {
                if (seq === requestSeq.current) setState(previous); // revert
            })
            .finally(() => {
                if (seq === requestSeq.current) setPending(false);
            });
    };

    const score = state.upvotes - state.downvotes;
    const disabled = !isSignedIn || pending;
    const signInTitle = isSignedIn ? undefined : "Sign in to vote";
    const iconSize = compact ? "w-4 h-4" : "w-5 h-5";
    const buttonBase = cn(
        "flex items-center justify-center rounded-full transition-colors",
        // No disabled:pointer-events-none — it would suppress the
        // "Sign in to vote" title tooltip for signed-out visitors.
        "hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        "focus-visible:outline-2 focus-visible:outline-ring",
        compact ? "p-0.5" : "p-1"
    );

    return (
        <div
            className={cn(
                "inline-flex items-center rounded-full border border-border bg-card",
                compact ? "gap-0.5 px-1 py-0.5" : "gap-1 px-1.5 py-1"
            )}
        >
            <button
                type="button"
                className={buttonBase}
                onClick={() => { castVote(1); }}
                disabled={disabled}
                title={signInTitle}
                aria-label="Upvote"
                aria-pressed={state.myVote === 1}
            >
                <ArrowBigUp
                    className={cn(
                        iconSize,
                        state.myVote === 1
                            ? "text-green-500 fill-current"
                            : "text-muted-foreground"
                    )}
                />
            </button>
            <span
                className={cn(
                    "min-w-5 text-center font-semibold tabular-nums",
                    compact ? "text-xs" : "text-sm",
                    state.myVote === 1 && "text-green-500",
                    state.myVote === -1 && "text-red-500",
                    state.myVote === 0 && "text-muted-foreground"
                )}
            >
                {score}
            </span>
            <button
                type="button"
                className={buttonBase}
                onClick={() => { castVote(-1); }}
                disabled={disabled}
                title={signInTitle}
                aria-label="Downvote"
                aria-pressed={state.myVote === -1}
            >
                <ArrowBigDown
                    className={cn(
                        iconSize,
                        state.myVote === -1
                            ? "text-red-500 fill-current"
                            : "text-muted-foreground"
                    )}
                />
            </button>
        </div>
    );
}
