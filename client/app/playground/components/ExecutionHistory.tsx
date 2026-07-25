"use client";

import { CheckCircle2, Clock, History, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionHistoryEntry } from "../types";

interface ExecutionHistoryProps {
    history: ExecutionHistoryEntry[];
    onRestore: (entry: ExecutionHistoryEntry) => void;
    onClear: () => void;
}

function timeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

function preview(text: string, maxLen = 80): string {
    const s = text.replace(/\s+/g, " ").trim();
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

export function ExecutionHistory({ history, onRestore, onClear }: ExecutionHistoryProps) {
    return (
        <div className="flex h-full flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
                <History className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    History
                </span>
                {history.length > 0 && (
                    <button
                        onClick={onClear}
                        className="ml-auto text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                {history.length === 0 ? (
                    <p className="py-8 text-center text-xs italic text-muted-foreground">
                        No executions yet. Run your script to see history.
                    </p>
                ) : (
                    <div className="divide-y">
                        {history.map((entry) => (
                            <div
                                key={entry.id}
                                className="group flex items-start gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                                onClick={() => onRestore(entry)}
                                title="Restore this version"
                            >
                                {/* Status icon */}
                                <div className="mt-0.5 shrink-0">
                                    {entry.status === "success" ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                    ) : (
                                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0 space-y-0.5">
                                    {/* Script preview */}
                                    <p className="text-[11px] font-mono text-foreground/80 truncate">
                                        {preview(entry.script)}
                                    </p>
                                    {/* Output preview */}
                                    <p className={cn(
                                        "text-[10px] truncate",
                                        entry.status === "success" ? "text-green-500/80" : "text-red-400/80"
                                    )}>
                                        {preview(entry.output, 60)}
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {timeAgo(entry.timestamp)}
                                        <span className="font-mono">{entry.time}</span>
                                    </div>
                                </div>

                                {/* Restore button — shown on hover */}
                                <button
                                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    title="Restore"
                                    onClick={(e) => { e.stopPropagation(); onRestore(entry); }}
                                >
                                    <RotateCcw className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
