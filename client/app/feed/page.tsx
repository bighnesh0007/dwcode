"use client";

/** Activity feed: recent solves and blog posts by the people you follow. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { CheckCircle2, Loader2, Newspaper, Rss } from "lucide-react";
import { difficultyClassName, getDifficultyTier } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface FeedItem {
  type: "solve" | "post";
  at: string;
  username: string;
  title: string;
  link: string;
  difficulty?: string;
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export default function FeedPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [feed, setFeed] = useState<{ following: number; items: FeedItem[] } | null>(null);

  useEffect(() => {
    if (isSignedIn) apiRequest<{ following: number; items: FeedItem[] }>("/api/v1/feed").then(setFeed).catch(() => setFeed({ following: 0, items: [] }));
  }, [isSignedIn]);

  return (
    <div className="container max-w-2xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Rss className="w-6 h-6 text-primary" /> Feed</h1>
      {isLoaded && !isSignedIn ? (
        <SignInButton mode="modal"><Button>Sign in to see your feed</Button></SignInButton>
      ) : !feed ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : feed.following === 0 ? (
        <p className="text-muted-foreground">Follow people from their profiles or the <Link href="/leaderboard" className="underline">leaderboard</Link> to see what they solve and write.</p>
      ) : feed.items.length === 0 ? (
        <p className="text-muted-foreground">Nothing new from the {feed.following} people you follow.</p>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {feed.items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                {item.type === "solve" ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 shrink-0" /> : <Newspaper className="w-4 h-4 mt-0.5 text-primary shrink-0" />}
                <div className="min-w-0 flex-1">
                  <Link href={`/profile/${encodeURIComponent(item.username)}`} className="font-medium hover:underline">@{item.username}</Link>{" "}
                  {item.type === "solve" ? "solved " : "wrote "}
                  <Link href={item.link} className="hover:underline">{item.title}</Link>
                  {item.difficulty && <span className={`ml-2 text-xs ${difficultyClassName(item.difficulty).text}`}>{getDifficultyTier(item.difficulty)?.label ?? item.difficulty}</span>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{ago(item.at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
