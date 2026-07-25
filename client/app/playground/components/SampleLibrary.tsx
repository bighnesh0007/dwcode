"use client";

import { Database, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SAMPLES } from "../samples";
import { LANGUAGE_LABEL } from "../types";
import type { PlaygroundFileLanguage } from "../types";

const LANG_COLORS: Record<PlaygroundFileLanguage, string> = {
    json: "text-yellow-600 bg-yellow-500/10 border-yellow-500/30 dark:text-yellow-400",
    xml: "text-orange-600 bg-orange-500/10 border-orange-500/30 dark:text-orange-400",
    csv: "text-green-600 bg-green-500/10 border-green-500/30 dark:text-green-400",
    yaml: "text-blue-600 bg-blue-500/10 border-blue-500/30 dark:text-blue-400",
    text: "text-muted-foreground bg-muted border-border",
    java: "text-red-600 bg-red-500/10 border-red-500/30 dark:text-red-400",
    ndjson: "text-purple-600 bg-purple-500/10 border-purple-500/30 dark:text-purple-400",
    multipart: "text-sky-600 bg-sky-500/10 border-sky-500/30 dark:text-sky-400",
};

interface SampleLibraryProps {
    onLoad: (content: string, language: PlaygroundFileLanguage, name: string) => void;
}

export function SampleLibrary({ onLoad }: SampleLibraryProps) {
    return (
        <div className="flex h-full flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
                <Database className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sample Data
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/60">{SAMPLES.length} samples</span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                <div className="divide-y">
                    {SAMPLES.map((s) => (
                        <div
                            key={s.id}
                            className="group flex items-start gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => onLoad(s.content, s.language, `${s.id}.${s.language === "text" ? "txt" : s.language}`)}
                            title="Load into active input file"
                        >
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium truncate">{s.label}</span>
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] py-0 h-4 shrink-0 ${LANG_COLORS[s.language]}`}
                                    >
                                        {LANGUAGE_LABEL[s.language]}
                                    </Badge>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-relaxed">
                                    {s.description}
                                </p>
                            </div>
                            <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 p-1 rounded hover:bg-muted"
                                title="Load sample"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLoad(s.content, s.language, `${s.id}.${s.language === "text" ? "txt" : s.language}`);
                                }}
                            >
                                <Plus className="w-3.5 h-3.5 text-primary" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
