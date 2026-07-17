"use client";

import { useState } from "react";
import {
    Bot,
    Lightbulb,
    Bug,
    Zap,
    WandSparkles,
    MessageSquare,
    Loader2,
    ClipboardCopy,
    Check,
    RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AiMode = "explain" | "errors" | "optimize" | "generate" | "suggest";

interface AiInsightsProps {
    script: string;
    inputSample: string;
    outputSample: string;
}

const MODES: { id: AiMode; label: string; icon: React.ReactNode; description: string }[] = [
    {
        id: "explain",
        label: "Explain",
        icon: <MessageSquare className="w-3.5 h-3.5" />,
        description: "Explain what this script does step by step",
    },
    {
        id: "errors",
        label: "Debug",
        icon: <Bug className="w-3.5 h-3.5" />,
        description: "Identify errors and show how to fix them",
    },
    {
        id: "optimize",
        label: "Optimize",
        icon: <Zap className="w-3.5 h-3.5" />,
        description: "Suggest performance and readability improvements",
    },
    {
        id: "suggest",
        label: "Suggestions",
        icon: <Lightbulb className="w-3.5 h-3.5" />,
        description: "General best-practice suggestions",
    },
    {
        id: "generate",
        label: "Generate",
        icon: <WandSparkles className="w-3.5 h-3.5" />,
        description: "Describe what you want and get DataWeave code",
    },
];

/** Minimal markdown → HTML for the result panel — headings, bullets, code blocks */
function renderResult(text: string): string {
    return text
        .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
            `<pre class="bg-muted/60 rounded p-2 text-[11px] font-mono overflow-x-auto my-2 whitespace-pre-wrap">${code.replace(/</g, "&lt;")}</pre>`
        )
        .replace(/^## (.+)$/gm, "<p class='font-semibold text-xs mt-3 mb-1'>$1</p>")
        .replace(/^### (.+)$/gm, "<p class='font-medium text-xs mt-2 mb-0.5 text-muted-foreground'>$1</p>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code class='bg-muted px-1 rounded text-[11px] font-mono'>$1</code>")
        .replace(/^[•\-*] (.+)$/gm, "<li class='ml-3 list-disc'>$1</li>")
        .replace(/\n\n/g, "</p><p class='mb-1.5'>")
        .replace(/\n/g, "<br/>");
}

export function AiInsights({ script, inputSample, outputSample }: AiInsightsProps) {
    const [mode, setMode] = useState<AiMode>("explain");
    const [userPrompt, setUserPrompt] = useState("");
    const [result, setResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const run = async (selectedMode = mode) => {
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch("/api/playground/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: selectedMode,
                    script,
                    inputSample,
                    outputSample,
                    userPrompt: selectedMode === "generate" ? userPrompt : undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error ?? "AI request failed.");
            setResult(data.result);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleMode = (m: AiMode) => {
        setMode(m);
        setResult(null);
        setError(null);
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    AI Insights
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/60">gemini-2.5-flash</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
                {/* Mode selector */}
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
                    {MODES.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => handleMode(m.id)}
                            title={m.description}
                            className={cn(
                                "flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-[10px] font-medium transition-colors",
                                mode === m.id
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            {m.icon}
                            {m.label}
                        </button>
                    ))}
                </div>

                {/* Generate prompt input */}
                {mode === "generate" && (
                    <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground font-medium">
                            Describe the transformation you want
                        </label>
                        <Textarea
                            value={userPrompt}
                            onChange={(e) => setUserPrompt(e.target.value)}
                            placeholder="e.g. Map an array of orders to a flat CSV-friendly structure with total price calculated"
                            rows={3}
                            className="text-xs font-mono resize-none"
                        />
                    </div>
                )}

                {/* Run button */}
                <Button
                    size="sm"
                    className="h-7 w-full text-xs gap-1.5"
                    onClick={() => run(mode)}
                    disabled={loading || (!script.trim() && mode !== "generate") || (mode === "generate" && !userPrompt.trim())}
                >
                    {loading ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
                    ) : (
                        <><Bot className="w-3.5 h-3.5" /> {MODES.find(m => m.id === mode)?.label}</>
                    )}
                </Button>

                {/* Error */}
                {error && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-500">
                        {error}
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className="relative rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                            <Bot className="w-3 h-3 text-primary" />
                            <span className="text-[10px] font-medium text-primary uppercase tracking-wider">
                                {MODES.find(m => m.id === mode)?.label}
                            </span>
                            <div className="ml-auto flex gap-1">
                                <button
                                    onClick={() => run(mode)}
                                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                                    title="Regenerate"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={handleCopy}
                                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                                    title="Copy result"
                                >
                                    {copied ? (
                                        <Check className="w-3 h-3 text-green-500" />
                                    ) : (
                                        <ClipboardCopy className="w-3 h-3" />
                                    )}
                                </button>
                            </div>
                        </div>
                        <div
                            className="text-xs text-foreground/90 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: `<p class='mb-1.5'>${renderResult(result)}</p>` }}
                        />
                    </div>
                )}

                {!result && !loading && !error && (
                    <p className="text-center text-[11px] italic text-muted-foreground py-4">
                        Select a mode above and click the button to get AI insights.
                    </p>
                )}
            </div>
        </div>
    );
}
