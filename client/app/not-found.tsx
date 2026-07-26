"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Home, Shuffle, Terminal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Meme {
    id: string;
    setup: string;
    punchline: string;
    code?: string;
}

const MEMES: Meme[] = [
    {
        id: "this-is-fine",
        setup: "The router, sitting in a room that is entirely on fire:",
        punchline: "“This is fine.”",
    },
    {
        id: "one-does-not-simply",
        setup: "One does not simply...",
        punchline: "walk into this URL and find a page.",
    },
    {
        id: "confused-travolta",
        setup: "*looks around the empty route*",
        punchline: "...the page?",
    },
    {
        id: "task-failed",
        setup: "Navigation complete.",
        punchline: "Task failed successfully.",
    },
    {
        id: "works-on-my-machine",
        setup: "“It works on my machine.”",
        punchline: "— this page, apparently. Only on someone else's machine.",
    },
    {
        id: "drake",
        setup: "Drake, recoiling: checking the URL for typos.",
        punchline: "Drake, pleased: blaming the router.",
    },
    {
        id: "expanding-brain",
        setup: "Expanding brain:",
        punchline:
            "Small brain: retype the URL\nGlowing brain: clear the cache\nGalaxy brain: accept that this page was never real",
    },
    {
        id: "sudo-find",
        setup: "Escalating privileges will not help you here.",
        punchline: "Not even root can see this page.",
        code: "$ sudo find / -name 'page'\nfind: 'page': No such file or directory",
    },
    {
        id: "dw-payload-not-found",
        setup: "The transform ran fine. The payload did not show up.",
        punchline: "DataWeave, ever honest:",
        code: '%dw 2.0\noutput application/json\n---\n{\n  error: 404,\n  message: "payload not found",\n  hint: "even reduce() can\'t accumulate a page that doesn\'t exist"\n}',
    },
    {
        id: "group-by",
        setup: "groupBy() couldn't group this page anywhere.",
        punchline: "It returned {} and quietly moved on with its life.",
    },
    {
        id: "mule-kick",
        setup: "The Mule kicked this URL straight into the void.",
        punchline: "The dead-letter queue sends its regards.",
    },
    {
        id: "filter-empty",
        setup: "We asked every route we know about.",
        punchline: "The result set speaks for itself.",
        code: 'routes filter ((r) -> r.path == "/this-one")\n// => []',
    },
];

/** Pick a random meme, never the one identified by `excludeId`. */
function pickMeme(excludeId: string | null): Meme {
    const pool = excludeId === null ? MEMES : MEMES.filter((m) => m.id !== excludeId);
    return pool[Math.floor(Math.random() * pool.length)];
}

export default function NotFound() {
    const [meme, setMeme] = useState<Meme | null>(null);

    // Randomise only after mount so server and client markup match. Deferred with
    // queueMicrotask so the state update is not synchronous inside the effect body
    // (same pattern as components/SkinProvider.tsx).
    useEffect(() => {
        queueMicrotask(() => {
            setMeme(pickMeme(null));
        });
    }, []);

    const shuffle = () => {
        setMeme((current) => pickMeme(current ? current.id : null));
    };

    return (
        <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-12 text-center">
            <p className="font-mono text-sm text-muted-foreground">
                {"// route lookup failed"}
            </p>
            <h1 className="mt-2 text-8xl font-black tracking-tighter text-primary sm:text-9xl">
                404
            </h1>
            <h2 className="mt-3 text-xl font-semibold sm:text-2xl">Page not found</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
                The URL you requested mapped to nothing. Have a meme while you decide where to go
                next.
            </p>

            {/* Meme card. Fixed min-height + always-rendered shell so nothing jumps when the
                randomly picked meme hydrates in (or when the user shuffles). */}
            <div
                aria-live="polite"
                className="mt-8 flex min-h-[15rem] w-full max-w-xl flex-col justify-center rounded-xl border border-border bg-card p-6 text-left shadow-sm"
            >
                {meme ? (
                    <div key={meme.id}>
                        <p className="whitespace-pre-line font-medium">{meme.setup}</p>
                        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                            {meme.punchline}
                        </p>
                        {meme.code !== undefined && (
                            <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/60 p-3">
                                <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
                                    <Terminal className="size-3.5" />
                                    <span className="font-mono text-[10px] uppercase tracking-wider">
                                        console
                                    </span>
                                </div>
                                <pre className="whitespace-pre font-mono text-xs leading-relaxed">
                                    {meme.code}
                                </pre>
                            </div>
                        )}
                    </div>
                ) : (
                    <div aria-hidden="true" className="invisible">
                        <p className="font-medium">placeholder</p>
                        <p className="mt-2 text-sm">placeholder</p>
                    </div>
                )}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button onClick={shuffle}>
                    <Shuffle data-icon="inline-start" />
                    Show me another meme
                </Button>
                <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
                    <Home data-icon="inline-start" />
                    Take me home
                </Link>
                <Link href="/problems" className={cn(buttonVariants({ variant: "ghost" }))}>
                    Practice instead
                </Link>
            </div>

            <p className="mt-10 font-mono text-xs text-muted-foreground">
                Error 404 &middot; The page transformed itself into null
            </p>
        </main>
    );
}
