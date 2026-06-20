"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, PenLine, Coins } from "lucide-react";
import Link from "next/link";

export default function NewBlogPage() {
    const router = useRouter();
    const { isSignedIn } = useAuth();
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [tags, setTags] = useState("");
    const [posting, setPosting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isSignedIn) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
                <p>Sign in to write a blog post.</p>
                <Link href="/sign-in"><Button>Sign In</Button></Link>
            </div>
        );
    }

    const handlePost = async () => {
        if (!title.trim() || !content.trim()) {
            setError("Title and content are required.");
            return;
        }
        setPosting(true);
        setError(null);
        try {
            const res = await fetch("/api/blog", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, content, tags }),
            });
            const data = await res.json();
            if (data.success) {
                router.push(`/blog/${data.post.slug}`);
            } else {
                setError(data.error || "Failed to publish.");
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setPosting(false);
        }
    };

    return (
        <div className="container max-w-screen-md mx-auto py-10 px-4 space-y-6">
            <Link href="/blog" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
                <ArrowLeft className="w-4 h-4" /> Back to Blog
            </Link>

            <div className="flex items-center gap-3">
                <PenLine className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">Write a Post</h1>
                <Badge variant="outline" className="text-xs gap-1 text-yellow-500 border-yellow-500/30 bg-yellow-500/10">
                    <Coins className="w-3 h-3" /> +2 coins on publish
                </Badge>
            </div>

            <Card>
                <CardContent className="space-y-4 pt-5">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Title *</label>
                        <Input
                            placeholder="e.g. How to use groupBy in DataWeave"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Content * <span className="text-muted-foreground font-normal text-xs">(Markdown supported)</span></label>
                        <Textarea
                            placeholder="Write your post content here. You can use **bold**, # headings, `code`, etc."
                            rows={16}
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="font-mono text-sm resize-y"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Tags <span className="text-muted-foreground font-normal">(comma separated)</span></label>
                        <Input
                            placeholder="DataWeave, MuleSoft, JSON"
                            value={tags}
                            onChange={e => setTags(e.target.value)}
                        />
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <Button onClick={handlePost} disabled={posting || !title.trim() || !content.trim()} className="gap-2">
                            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Publish Post
                        </Button>
                        <Link href="/blog">
                            <Button variant="outline">Cancel</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
