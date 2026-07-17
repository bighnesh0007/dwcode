"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Plus, Calendar, Loader2, Tag, ExternalLink } from "lucide-react";
import type { BlogPost } from "@/lib/types";

// LinkedIn brand icon (inline SVG — not in all lucide versions)
function LinkedInIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.45 20.45h-3.554v-5.57c0-1.328-.025-3.037-1.85-3.037-1.854 0-2.138 1.447-2.138 2.942v5.665H9.354V9h3.414v1.56h.049c.476-.9 1.637-1.85 3.368-1.85 3.6 0 4.266 2.368 4.266 5.451v6.289zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zm1.777 13.017H3.56V9h3.554v11.45zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
    );
}

/**
 * Extract a clean plain-text preview from raw blog content.
 * Strips markdown syntax, HTML tags, and iframe embeds.
 * Returns at most `maxLen` characters.
 */
function extractPreview(content: string, maxLen = 280): string {
    return content
        // Remove fenced code blocks entirely
        .replace(/```[\s\S]*?```/g, "")
        // Remove inline code
        .replace(/`[^`]+`/g, "")
        // Remove HTML tags and iframes
        .replace(/<[^>]+>/g, "")
        // Remove markdown headings, bold, italic, links, lists
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/\[(.+?)\]\(.+?\)/g, "$1")
        .replace(/^[-*>\s]+/gm, "")
        // Collapse whitespace
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLen);
}

/**
 * Returns the LinkedIn post URL if the content contains a LinkedIn iframe embed,
 * otherwise null.
 */
function extractLinkedInUrl(content: string): string | null {
    // Match <iframe ... src="https://www.linkedin.com/embed/feed/update/..." ...>
    const match = content.match(
        /src=["'](https:\/\/www\.linkedin\.com\/embed\/feed\/update\/[^"']+)["']/i
    );
    if (!match) return null;
    // Convert embed URL → public post URL
    // e.g. https://www.linkedin.com/embed/feed/update/urn:li:activity:123
    //   → https://www.linkedin.com/feed/update/urn:li:activity:123
    return match[1].replace("/embed/feed/", "/feed/");
}

function AuthorAvatar({ name, imageUrl }: { name: string; imageUrl: string }) {
    return imageUrl ? (
        <Image unoptimized src={imageUrl} width={20} height={20} className="w-5 h-5 rounded-full" alt={name} />
    ) : (
        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
            {(name || "?")[0].toUpperCase()}
        </div>
    );
}

export default function BlogPage() {
    const { isSignedIn } = useAuth();
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/blog")
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) setPosts(d); })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="container max-w-screen-lg mx-auto py-10 px-4 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <BookOpen className="w-7 h-7 text-primary" />
                        Community Blog
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        DataWeave tips, tricks, and tutorials from the community.
                    </p>
                </div>
                {isSignedIn && (
                    <Link href="/blog/new">
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" />
                            Write a Post
                        </Button>
                    </Link>
                )}
            </div>

            {/* States */}
            {loading ? (
                <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading posts…
                </div>
            ) : posts.length === 0 ? (
                <div className="text-center py-24 text-muted-foreground space-y-4">
                    <BookOpen className="w-12 h-12 mx-auto opacity-20" />
                    <p>No posts yet. Be the first to write something!</p>
                    {isSignedIn && (
                        <Link href="/blog/new">
                            <Button variant="outline">Write the first post</Button>
                        </Link>
                    )}
                </div>
            ) : (
                <div className="grid gap-5">
                    {posts.map(post => {
                        const linkedInUrl = extractLinkedInUrl(post.content);
                        const preview = extractPreview(post.content);

                        return (
                            <Card key={post._id} className="hover:shadow-md transition-shadow group">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <Link href={`/blog/${post.slug}`}>
                                                <CardTitle className="text-lg hover:text-primary transition-colors cursor-pointer line-clamp-2">
                                                    {post.title}
                                                </CardTitle>
                                            </Link>
                                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                <div className="flex items-center gap-1.5">
                                                    <AuthorAvatar name={post.authorName} imageUrl={post.authorImageUrl} />
                                                    <span className="text-xs text-muted-foreground font-medium">{post.authorName}</span>
                                                </div>
                                                <span className="text-muted-foreground/40 text-xs">·</span>
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {new Date(post.createdAt).toLocaleDateString(undefined, {
                                                        month: "short", day: "numeric", year: "numeric",
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="pt-0 space-y-3">
                                    {/* LinkedIn embed preview card */}
                                    {linkedInUrl ? (
                                        <a
                                            href={linkedInUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 rounded-lg border border-[#0A66C2]/30 bg-[#0A66C2]/5 px-4 py-3 hover:bg-[#0A66C2]/10 transition-colors group/li"
                                        >
                                            <LinkedInIcon className="w-5 h-5 shrink-0 text-[#0A66C2]" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-[#0A66C2]">LinkedIn Post</p>
                                                {preview && (
                                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{preview}</p>
                                                )}
                                            </div>
                                            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#0A66C2] opacity-60 group-hover/li:opacity-100" />
                                        </a>
                                    ) : (
                                        /* Plain text preview */
                                        preview && (
                                            <p className="text-sm text-muted-foreground line-clamp-3">
                                                {preview}{preview.length === 280 ? "…" : ""}
                                            </p>
                                        )
                                    )}

                                    {/* Tags + Read more */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex flex-wrap gap-1.5">
                                            {(post.tags || []).slice(0, 4).map(t => (
                                                <Badge key={t} variant="secondary" className="text-[10px] py-0 gap-1">
                                                    <Tag className="w-2.5 h-2.5" />{t}
                                                </Badge>
                                            ))}
                                        </div>
                                        <Link href={`/blog/${post.slug}`}>
                                            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary">
                                                Read more →
                                            </Button>
                                        </Link>
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
