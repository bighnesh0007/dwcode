"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Plus, Calendar, Loader2, Tag } from "lucide-react";

interface BlogPost {
    _id: string;
    title: string;
    slug: string;
    authorName: string;
    authorImageUrl: string;
    tags: string[];
    createdAt: string;
    content: string;
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
                    {posts.map(post => (
                        <Card key={post._id} className="hover:shadow-md transition-shadow group">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <Link href={`/blog/${post.slug}`}>
                                            <CardTitle className="text-lg hover:text-primary transition-colors cursor-pointer line-clamp-2">
                                                {post.title}
                                            </CardTitle>
                                        </Link>
                                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                                            <div className="flex items-center gap-1.5">
                                                {post.authorImageUrl ? (
                                                    <img src={post.authorImageUrl} className="w-5 h-5 rounded-full" alt={post.authorName} />
                                                ) : (
                                                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                                        {(post.authorName || "?")[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <span className="text-xs text-muted-foreground font-medium">{post.authorName}</span>
                                            </div>
                                            <span className="text-muted-foreground/40 text-xs">·</span>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0 space-y-3">
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                    {post.content.replace(/[#*`_>-]/g, "").slice(0, 300)}…
                                </p>
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
                    ))}
                </div>
            )}
        </div>
    );
}
