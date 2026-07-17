"use client";

import { useState, useEffect } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getErrorMessage } from "@/lib/errors";
import { Trash2, MessageSquare, Loader2 } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import type { Comment } from "@/lib/types";

export function Comments({ problemSlug }: { problemSlug: string }) {
    const { user, isSignedIn } = useUser();
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);

    const fetchComments = async () => {
        try {
            const res = await fetch(`/api/comments?problemSlug=${problemSlug}`);
            const data = await res.json();
            if (Array.isArray(data)) setComments(data);
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetch(`/api/comments?problemSlug=${problemSlug}`)
            .then((response) => response.json())
            .then((data) => { if (Array.isArray(data)) setComments(data); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [problemSlug]);

    const handlePost = async () => {
        if (!draft.trim()) return;
        setPosting(true);
        setError(null);
        try {
            const res = await fetch("/api/comments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ problemSlug, content: draft.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                setDraft("");
                fetchComments();
            } else {
                setError(data.error || "Failed to post comment");
            }
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setPosting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/comments?id=${id}`, { method: "DELETE" });
            setComments((prev) => prev.filter((c) => c._id !== id));
        } catch {
            // ignore
        }
    };

    return (
        <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Discussion</span>
                <Badge variant="secondary" className="text-[10px] py-0">{comments.length}</Badge>
            </div>

            {/* Post box */}
            {isSignedIn ? (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        {user?.imageUrl ? (
                            <Image unoptimized src={user.imageUrl} width={24} height={24} className="w-6 h-6 rounded-full" alt={user.fullName || ""} />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                {(user?.fullName || user?.username || "?")[0].toUpperCase()}
                            </div>
                        )}
                        <span className="text-xs font-medium text-muted-foreground">
                            {user?.fullName || user?.username}
                        </span>
                    </div>
                    <Textarea
                        placeholder="Share your approach, ask a question, or give feedback…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        className="text-sm resize-none"
                    />
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Markdown supported</span>
                        <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handlePost}
                            disabled={posting || !draft.trim()}
                        >
                            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                            Post Comment
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="py-3 px-4 rounded-lg bg-muted/40 border border-dashed text-sm text-muted-foreground flex items-center justify-between gap-3">
                    <span>Sign in to join the discussion.</span>
                    <SignInButton mode="modal">
                        <Button size="sm" variant="outline" className="h-7 text-xs">Sign In</Button>
                    </SignInButton>
                </div>
            )}

            {/* Comments list */}
            {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading comments…
                </div>
            ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No comments yet. Be the first!</p>
            ) : (
                <div className="space-y-3">
                    {comments.map((c) => (
                        <div key={c._id} className="flex gap-2.5 group">
                            {c.userImageUrl ? (
                                <Image unoptimized src={c.userImageUrl} width={28} height={28} className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5" alt={c.userName} />
                            ) : (
                                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 mt-0.5">
                                    {(c.userName || "?")[0].toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold">{c.userName}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {new Date(c.createdAt).toLocaleDateString(undefined, {
                                                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                                            })}
                                        </span>
                                    </div>
                                    {user?.id === c.userId && (
                                        <button
                                            onClick={() => handleDelete(c._id)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                                <div
                                    className="text-sm text-foreground/90 mt-1 leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(c.content) }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
