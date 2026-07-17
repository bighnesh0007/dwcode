"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Tag, Trash2, Loader2, Share2, Check } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import type { BlogPost } from "@/lib/types";

/**
 * Wrap iframes in a responsive container so they don't overflow on mobile.
 * LinkedIn embed iframes have no width/height constraints by default.
 */
function wrapIframes(html: string): string {
    return html.replace(
        /<iframe([^>]*)>/gi,
        "<div class='relative w-full overflow-hidden rounded-lg my-4 not-prose' style='max-width:552px;margin-inline:auto'><iframe$1 style='width:100%;border:none;'>"
    ).replace(/<\/iframe>/gi, "</iframe></div>");
}

// ---------------------------------------------------------------------------

export default function BlogPostPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;
    const { user } = useUser();

    const [post, setPost] = useState<BlogPost | null>(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [hasAdminAccess, setHasAdminAccess] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetch(`/api/blog/${slug}`)
            .then(r => r.json())
            .then(d => { if (!d.error) setPost(d); })
            .finally(() => setLoading(false));
    }, [slug]);

    useEffect(() => {
        if (!user || !post) return;
        if (post.authorId === user.id) return;
        // Check admin rights
        fetch("/api/admin/users")
            .then(r => r.json())
            .then(d => { if (!d.error) setHasAdminAccess(true); })
            .catch(() => { });
    }, [user, post]);

    const canDelete = post?.authorId === user?.id || hasAdminAccess;

    const handleDelete = async () => {
        if (!confirm("Delete this post?")) return;
        setDeleting(true);
        await fetch(`/api/blog/${slug}`, { method: "DELETE" });
        router.push("/blog");
    };

    const handleShare = async () => {
        const url = window.location.href;
        try {
            if (navigator.share) {
                await navigator.share({ title: post?.title ?? "DWCode Blog", url });
            } else {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        } catch { /* user cancelled */ }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading…
            </div>
        );
    }

    if (!post) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
                <p>Post not found.</p>
                <Link href="/blog"><Button variant="outline">Back to Blog</Button></Link>
            </div>
        );
    }

    const renderedContent = wrapIframes(
        `<p class='mb-3'>${renderMarkdown(post.content)}</p>`
    );

    return (
        <div className="container max-w-screen-md mx-auto py-10 px-4 space-y-6">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-3">
                <Link
                    href="/blog"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Blog
                </Link>

                <div className="flex items-center gap-2">
                    {/* Share button — works for everyone, no login needed */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={handleShare}
                    >
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-green-500" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Share2 className="w-3.5 h-3.5" />
                                Share
                            </>
                        )}
                    </Button>

                    {/* Delete — only for author / admin */}
                    {canDelete && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-7 text-xs gap-1"
                            onClick={handleDelete}
                            disabled={deleting}
                        >
                            {deleting
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            Delete
                        </Button>
                    )}
                </div>
            </div>

            {/* Post header */}
            <div className="space-y-4">
                <h1 className="text-3xl font-bold tracking-tight leading-tight">{post.title}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        {post.authorImageUrl ? (
                            <Image unoptimized src={post.authorImageUrl} width={28} height={28} className="w-7 h-7 rounded-full" alt={post.authorName} />
                        ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                {(post.authorName || "?")[0].toUpperCase()}
                            </div>
                        )}
                        <span className="text-sm font-medium">{post.authorName}</span>
                    </div>
                    <span className="text-muted-foreground/40">·</span>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(post.createdAt).toLocaleDateString(undefined, {
                            month: "long", day: "numeric", year: "numeric",
                        })}
                    </div>
                </div>
                {(post.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {post.tags.map((t: string) => (
                            <Badge key={t} variant="secondary" className="text-xs gap-1">
                                <Tag className="w-3 h-3" />{t}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            <hr className="border-border/60" />

            {/* Post content — iframes rendered, not escaped */}
            <article
                className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
        </div>
    );
}
