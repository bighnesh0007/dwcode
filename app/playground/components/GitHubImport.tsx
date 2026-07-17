"use client";

import { useState } from "react";
import {
    GitBranch,
    Folder,
    FileCode2,
    Loader2,
    Search,
    X,
    Download,
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface GitHubImportProps {
    onImport: (fileName: string, content: string) => void;
    onClose: () => void;
}

type Step = "repo" | "file";

export function GitHubImport({ onImport, onClose }: GitHubImportProps) {
    const [step, setStep] = useState<Step>("repo");
    const [repo, setRepo] = useState("");
    const [files, setFiles] = useState<string[]>([]);
    const [filter, setFilter] = useState("");
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    /* ── Step 1: browse repo tree ─────────────────────────────────────────── */
    const handleBrowse = async () => {
        const trimmed = repo.trim();
        if (!trimmed) return;
        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/playground/github/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo: trimmed }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Could not load repo.");
            setFiles(data.files ?? []);
            setStep("file");
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    /* ── Step 2: import selected file ────────────────────────────────────── */
    const handleImportFile = async (path: string) => {
        setImporting(path);
        setError(null);
        try {
            const params = new URLSearchParams({ repo: repo.trim(), path });
            const res = await fetch(`/api/playground/github/import?${params}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Import failed.");
            onImport(data.fileName, data.content);
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setImporting(null);
        }
    };

    const filtered = files.filter((f) =>
        filter ? f.toLowerCase().includes(filter.toLowerCase()) : true
    );

    /* Only show text-based files that are useful as DW inputs */
    const importableExtensions = [
        ".json", ".xml", ".csv", ".yaml", ".yml",
        ".txt", ".dwl", ".dw", ".ndjson",
    ];
    const importable = filtered.filter((f) =>
        importableExtensions.some((ext) => f.toLowerCase().endsWith(ext))
    );

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-label="Import from GitHub"
        >
            <div className="relative w-full max-w-lg rounded-2xl border bg-card shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
                    <GitBranch className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Import from GitHub</span>
                    {step === "file" && (
                        <>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground font-mono truncate max-w-[200px]">
                                {repo}
                            </span>
                        </>
                    )}
                    <button
                        onClick={onClose}
                        className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    {/* Step 1: enter repo */}
                    {step === "repo" && (
                        <>
                            <p className="text-xs text-muted-foreground">
                                Enter a GitHub repository you have access to. We&apos;ll list
                                its files so you can pick one to import as a playground input.
                            </p>
                            <div className="flex gap-2">
                                <Input
                                    value={repo}
                                    onChange={(e) => setRepo(e.target.value)}
                                    placeholder="owner/repository"
                                    className="text-sm font-mono h-8"
                                    onKeyDown={(e) => e.key === "Enter" && handleBrowse()}
                                    autoFocus
                                />
                                <Button
                                    size="sm"
                                    className="h-8 text-xs gap-1.5 shrink-0"
                                    onClick={handleBrowse}
                                    disabled={loading || !repo.trim()}
                                >
                                    {loading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Folder className="w-3.5 h-3.5" />
                                    )}
                                    Browse
                                </Button>
                            </div>
                        </>
                    )}

                    {/* Step 2: pick file */}
                    {step === "file" && (
                        <>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                    <Input
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value)}
                                        placeholder="Filter files…"
                                        className="pl-8 text-xs h-8"
                                        autoFocus
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => { setStep("repo"); setFiles([]); setFilter(""); }}
                                >
                                    ← Back
                                </Button>
                            </div>

                            <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
                                {importable.length === 0 ? (
                                    <p className="py-6 text-center text-xs text-muted-foreground italic">
                                        {filter
                                            ? "No matching importable files."
                                            : "No importable files found (JSON, XML, CSV, YAML, TXT, DWL)."}
                                    </p>
                                ) : (
                                    <div className="divide-y">
                                        {importable.map((path) => (
                                            <div
                                                key={path}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors",
                                                    importing === path && "opacity-50 pointer-events-none"
                                                )}
                                            >
                                                <FileCode2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                <span className="flex-1 text-xs font-mono truncate" title={path}>
                                                    {path}
                                                </span>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 text-[10px] gap-1 shrink-0"
                                                    onClick={() => handleImportFile(path)}
                                                    disabled={!!importing}
                                                >
                                                    {importing === path ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <Download className="w-3 h-3" />
                                                    )}
                                                    Import
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <p className="text-[10px] text-muted-foreground">
                                {importable.length} importable file{importable.length !== 1 ? "s" : ""} shown
                                {filter && ` matching "${filter}"`}.
                                Selecting a file loads it as a new input in the active playground session.
                            </p>
                        </>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-500">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
