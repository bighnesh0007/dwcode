"use client";

import { useState } from "react";
import { Bookmark, BookmarkPlus, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SavedSnippet } from "../types";

interface SavedSnippetsProps {
    snippets: SavedSnippet[];
    currentScript: string;
    currentFiles: import("../types").PlaygroundFile[];
    onSave: (name: string) => void;
    onLoad: (snippet: SavedSnippet) => void;
    onDelete: (id: string) => void;
}

function relativeDate(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function scriptPreview(script: string, max = 80): string {
    return script.replace(/\s+/g, " ").trim().slice(0, max) + (script.length > max ? "…" : "");
}

export function SavedSnippets({
    snippets,
    onSave,
    onLoad,
    onDelete,
}: SavedSnippetsProps) {
    const [name, setName] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const handleSave = () => {
        const trimmed = name.trim() || `Snippet ${new Date().toLocaleString()}`;
        onSave(trimmed);
        setName("");
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
                <Bookmark className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Saved Snippets
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/60">local</span>
            </div>

            {/* Save current */}
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Snippet name…"
                    className="h-7 text-xs flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={handleSave}>
                    <BookmarkPlus className="w-3 h-3" />
                    Save
                </Button>
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-auto">
                {snippets.length === 0 ? (
                    <p className="py-8 text-center text-xs italic text-muted-foreground">
                        No saved snippets yet.
                    </p>
                ) : (
                    <div className="divide-y">
                        {snippets.map((s) => (
                            <div
                                key={s.id}
                                className="group flex items-start gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                                onClick={() => onLoad(s)}
                                title="Load this snippet"
                            >
                                <Bookmark className="w-3.5 h-3.5 text-primary/60 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0 space-y-0.5">
                                    <p className="text-xs font-medium truncate">{s.name}</p>
                                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                                        {scriptPreview(s.script)}
                                    </p>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Calendar className="w-3 h-3" />
                                        {relativeDate(s.savedAt)}
                                        <span className="text-muted-foreground/50">·</span>
                                        <span>{s.files.length} input{s.files.length !== 1 ? "s" : ""}</span>
                                    </div>
                                </div>

                                {/* Delete */}
                                {confirmDelete === s.id ? (
                                    <div className="flex gap-1 shrink-0 mt-0.5">
                                        <button
                                            className="text-[10px] text-red-500 hover:text-red-400 font-medium"
                                            onClick={(e) => { e.stopPropagation(); onDelete(s.id); setConfirmDelete(null); }}
                                        >
                                            Delete
                                        </button>
                                        <button
                                            className="text-[10px] text-muted-foreground hover:text-foreground"
                                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(s.id); }}
                                        title="Delete snippet"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
