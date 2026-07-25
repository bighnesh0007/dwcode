"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import {
  Check, Columns2, Copy, Database, Download, ExternalLink,
  GitBranch, History, Bookmark, LayoutPanelTop, Loader2, MoreHorizontal, Play,
  RotateCcw, Share2, Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizableHandle, ResizablePanel, ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileExplorer } from "./components/FileExplorer";
import { TestRunner } from "./components/TestRunner";
import { ExecutionHistory } from "./components/ExecutionHistory";
import { SavedSnippets } from "./components/SavedSnippets";
import { SampleLibrary } from "./components/SampleLibrary";
import { GitHubImport } from "./components/GitHubImport";
import { PlaygroundSettings } from "./components/PlaygroundSettings";
import { registerDataWeaveLanguage } from "./monarch";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  resolveEditorTheme,
  saveSettings,
  toEditorOptions,
  type PlaygroundSettings as Settings,
} from "./settings";
import {
  LANGUAGE_MIME,
  type PlaygroundFile, type PlaygroundFileLanguage,
  type PlaygroundTestCase, type ExecutionHistoryEntry, type SavedSnippet,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SCRIPT = `%dw 2.0
output application/json
---
payload map (item) -> {
  id: item.id,
  name: upper(item.name)
}`;

const DEFAULT_FILES: PlaygroundFile[] = [
  { id: "payload", name: "payload.json", kind: "payload", language: "json", content: `[\n  { "id": 1, "name": "alice" },\n  { "id": 2, "name": "bob" }\n]` },
  { id: "vars", name: "vars.json", kind: "vars", language: "json", content: "{}" },
  { id: "attributes", name: "attributes.json", kind: "attributes", language: "json", content: "{}" },
];

const LS_HISTORY = "dwcode_pg_history";
const LS_SNIPPETS = "dwcode_pg_snippets";
const MAX_HISTORY = 30;
const COMMIT_MESSAGE = "DataWeave playground run";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function cloneFiles(files: PlaygroundFile[]) { return files.map((f) => ({ ...f })); }

function getKindFromName(name: string): PlaygroundFile["kind"] {
  const stem = name.toLowerCase().replace(/\.[^.]+$/, "");
  if (stem === "payload") return "payload";
  if (stem === "vars") return "vars";
  if (stem === "attributes") return "attributes";
  return "custom";
}

function getLanguageFromName(name: string): PlaygroundFileLanguage {
  const n = name.toLowerCase();
  if (n.endsWith(".xml")) return "xml";
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".yaml") || n.endsWith(".yml")) return "yaml";
  if (n.endsWith(".txt")) return "text";
  if (n.endsWith(".ndjson")) return "ndjson";
  return "json";
}

function getInputName(file: PlaygroundFile) {
  return file.name.replace(/\.[^.]+$/, "").trim() || file.kind || "payload";
}

function buildTransformInputs(files: PlaygroundFile[]) {
  return files.map((f) => ({
    name: getInputName(f),
    mimeType: LANGUAGE_MIME[f.language],
    value: f.language === "json"
      ? (() => { try { return JSON.parse(f.content); } catch { return f.content; } })()
      : f.content,
  }));
}

function normalizeOutput(v: string) {
  try { return JSON.stringify(JSON.parse(v)); } catch { return v.trim(); }
}

function downloadTextFile(name: string, content: string) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" })),
    download: name,
  });
  document.body.appendChild(a); a.click(); a.remove();
}

function getErrorMessage(e: unknown, fb: string) {
  return e instanceof Error ? e.message : fb;
}

function loadLS<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function PlaygroundPage() {
  const { resolvedTheme } = useTheme();

  // User preferences (persisted). Loaded after mount to avoid a hydration mismatch.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const editorTheme = resolveEditorTheme(settings.theme, resolvedTheme);
  const editorOptions = useMemo(() => toEditorOptions(settings), [settings]);
  // Input editors read slightly smaller than the main script editor.
  const inputEditorOptions = useMemo(() => toEditorOptions(settings, -1), [settings]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  // Core editor state
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [files, setFiles] = useState<PlaygroundFile[]>(() => cloneFiles(DEFAULT_FILES));
  const [activeFileId, setActiveFileId] = useState(DEFAULT_FILES[0].id);
  const [testCases, setTestCases] = useState<PlaygroundTestCase[]>([]);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [executionTime, setExecutionTime] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Toolbar state
  const [isSharing, setIsSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ message: string; url?: string; error?: boolean } | null>(null);
  // The commit message used to be an inline text input in the top toolbar, which was
  // a large part of why that bar felt cramped. Commits now use a fixed message; a
  // proper publish dialog is the right home for a custom one.
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState("");
  const [githubRepo, setGithubRepo] = useState("dwcode-workspace");
  const [showGHImport, setShowGHImport] = useState(false);

  // Layout. `settings.orientation` is the user's choice; a narrow viewport always
  // forces vertical because three side-by-side panes are unusable on a phone.
  const [isNarrow, setIsNarrow] = useState(false);
  const orientation = isNarrow ? "vertical" : settings.orientation;
  const [activeInputTab, setActiveInputTab] = useState("files");
  const [rightTab, setRightTab] = useState("output");

  // New features
  const [execHistory, setExecHistory] = useState<ExecutionHistoryEntry[]>([]);
  const [savedSnippets, setSavedSnippets] = useState<SavedSnippet[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) ?? files[0],
    [activeFileId, files]
  );

  // ── Init: load localStorage + snippet from URL + GitHub status ─────────────
  useEffect(() => {
    const storageTimeout = setTimeout(() => {
      setExecHistory(loadLS<ExecutionHistoryEntry[]>(LS_HISTORY, []));
      setSavedSnippets(loadLS<SavedSnippet[]>(LS_SNIPPETS, []));
      setSettings(loadSettings());
    }, 0);

    // Mobile layout
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsNarrow(media.matches);
    sync(); media.addEventListener("change", sync);

    // GitHub status
    fetch("/api/github/status")
      .then((r) => r.json())
      .then((d) => {
        setGithubConnected(Boolean(d.connected));
        setGithubUsername(d.username || "");
        setGithubRepo(d.repoName || "dwcode-workspace");
      })
      .catch(() => { });

    // Shared snippet from URL
    const snippetId = new URLSearchParams(window.location.search).get("id");
    if (!snippetId) return () => {
      clearTimeout(storageTimeout);
      media.removeEventListener("change", sync);
    };

    let cancelled = false;
    fetch(`/api/playground/share?id=${snippetId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || d.error) return;
        const loadedFiles = Array.isArray(d.files) && d.files.length
          ? d.files.map((f: Partial<PlaygroundFile>, i: number) => ({
            id: createId(`file-${i}`), name: f.name ?? `input-${i + 1}.json`,
            kind: f.kind ?? getKindFromName(f.name ?? ""),
            language: f.language ?? getLanguageFromName(f.name ?? ""),
            content: f.content ?? "",
          }))
          : cloneFiles(DEFAULT_FILES);
        setScript(d.script ?? DEFAULT_SCRIPT);
        setFiles(loadedFiles);
        setActiveFileId(loadedFiles[0].id);
        setTestCases(Array.isArray(d.testCases)
          ? d.testCases.map((tc: Partial<PlaygroundTestCase>, i: number) => ({
            id: createId(`test-${i}`), name: tc.name ?? `Test ${i + 1}`,
            files: Array.isArray(tc.files)
              ? tc.files.map((f: Partial<PlaygroundFile>, fi: number) => ({
                id: createId(`tf-${fi}`), name: f.name ?? `input-${fi + 1}.json`,
                kind: f.kind ?? getKindFromName(f.name ?? ""),
                language: f.language ?? getLanguageFromName(f.name ?? ""),
                content: f.content ?? "",
              }))
              : cloneFiles(loadedFiles),
            expectedOutput: tc.expectedOutput ?? "",
          }))
          : []);
        setStatus("idle");
        setOutput("");
        setExecutionTime(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setOutput(getErrorMessage(error, "Could not load shared snippet."));
      });
    return () => {
      cancelled = true;
      clearTimeout(storageTimeout);
      media.removeEventListener("change", sync);
    };
  }, []);

  // ── Core run ──────────────────────────────────────────────────────────────────
  const runTransform = useCallback(async (
    runScript: string, runFiles: PlaygroundFile[], signal?: AbortSignal,
  ) => {
    const r = await fetch("/api/transform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: runScript, inputs: buildTransformInputs(runFiles) }),
      signal,
    });
    return r.json();
  }, []);

  const handleRun = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setIsRunning(true); setStatus("idle"); setOutput(""); setExecutionTime(null);
    try {
      const data = await runTransform(script, files, abortRef.current.signal);
      const ok = Boolean(data.success);
      setStatus(ok ? "success" : "error");
      setOutput(data.output ?? (ok ? "" : "Compilation failed"));
      setExecutionTime(data.time ?? null);

      // Record in execution history
      const entry: ExecutionHistoryEntry = {
        id: createId("h"), timestamp: Date.now(), script, files: cloneFiles(files),
        output: data.output ?? "", status: ok ? "success" : "error",
        time: data.time ?? "?",
      };
      setExecHistory((prev) => {
        const next = [entry, ...prev].slice(0, MAX_HISTORY);
        saveLS(LS_HISTORY, next);
        return next;
      });
      if (ok) setRightTab("output");
    } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setStatus("error");
        setOutput(`Network error: ${getErrorMessage(e, "Request failed.")}`);
      }
    } finally { setIsRunning(false); }
  }, [script, files, runTransform]);

  // ── Auto-run ──────────────────────────────────────────────────────────────────
  // Opt-in (off by default): re-run after the user stops typing. Deliberately keyed
  // on script/files content only, so toggling panels or settings does not fire a run.
  const scriptSignature = useMemo(
    () => `${script} ${files.map((f) => `${f.name}:${f.language}:${f.content}`).join(" ")}`,
    [script, files],
  );
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (settings.autoRunDelay === 0) return;
    // Skip the very first pass so simply opening the playground does not compile.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      void handleRun();
    }, settings.autoRunDelay);
    return () => clearTimeout(timer);
    // handleRun is intentionally omitted: it changes identity on every keystroke
    // (it closes over script/files), which would reset the debounce every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptSignature, settings.autoRunDelay]);

  // ── File operations ───────────────────────────────────────────────────────────
  const handleAddFile = useCallback(() => {
    const f: PlaygroundFile = {
      id: createId("file"), name: `input-${files.length + 1}.json`,
      kind: "custom", language: "json", content: "{}",
    };
    setFiles((cur) => [...cur, f]);
    setActiveFileId(f.id);
  }, [files.length]);

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((cur) => {
      if (cur.length <= 1) return cur;
      const next = cur.filter((f) => f.id !== id);
      if (activeFileId === id) setActiveFileId(next[0].id);
      return next;
    });
  }, [activeFileId]);

  const handleRenameFile = useCallback((id: string, name: string) => {
    setFiles((cur) => cur.map((f) =>
      f.id === id ? { ...f, name, kind: getKindFromName(name), language: getLanguageFromName(name) } : f
    ));
  }, []);

  const handleChangeLanguage = useCallback((id: string, lang: PlaygroundFileLanguage) => {
    setFiles((cur) => cur.map((f) => f.id === id ? { ...f, language: lang } : f));
  }, []);

  const handleUpdateFileContent = useCallback((content: string) => {
    setFiles((cur) => cur.map((f) => f.id === activeFileId ? { ...f, content } : f));
  }, [activeFileId]);

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    const rf = cloneFiles(DEFAULT_FILES);
    setScript(DEFAULT_SCRIPT); setFiles(rf); setActiveFileId(rf[0].id);
    setTestCases([]); setOutput(""); setStatus("idle"); setExecutionTime(null);
    setPublishResult(null);
  }, []);

  // ── Copy output ───────────────────────────────────────────────────────────────
  const handleCopyOutput = useCallback(async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [output]);

  // ── Share ─────────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const r = await fetch("/api/playground/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, files, testCases }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not share snippet.");
      await navigator.clipboard.writeText(`${window.location.origin}/playground?id=${d.id}`);
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2500);
    } catch (e: unknown) {
      setStatus("error"); setOutput(getErrorMessage(e, "Could not create share link."));
    } finally { setIsSharing(false); }
  }, [script, files, testCases]);

  // ── GitHub publish ────────────────────────────────────────────────────────────
  const handlePublishToGitHub = useCallback(async () => {
    setIsPublishing(true); setPublishResult(null);
    try {
      const r = await fetch("/api/playground/github/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, files, testCases, output, message: COMMIT_MESSAGE }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "GitHub publish failed.");
      setPublishResult({ message: `Published to ${d.repo}`, url: d.url });
    } catch (e) {
      setPublishResult({ message: getErrorMessage(e, "GitHub publish failed."), error: true });
    } finally { setIsPublishing(false); }
  }, [script, files, testCases, output]);

  // ── GitHub import ─────────────────────────────────────────────────────────────
  const handleGitHubImport = useCallback((fileName: string, content: string) => {
    const lang = getLanguageFromName(fileName);
    const f: PlaygroundFile = {
      id: createId("gh"), name: fileName, kind: getKindFromName(fileName),
      language: lang, content,
    };
    setFiles((cur) => [...cur, f]);
    setActiveFileId(f.id);
    setShowGHImport(false);
    setActiveInputTab("files");
  }, []);

  // ── Tests ─────────────────────────────────────────────────────────────────────
  const handleAddTest = useCallback(() => {
    const tc: PlaygroundTestCase = {
      id: createId("test"), name: `Test ${testCases.length + 1}`,
      files: cloneFiles(files), expectedOutput: "",
    };
    setTestCases((cur) => [...cur, tc]);
    setActiveInputTab("tests");
  }, [testCases.length, files]);

  const handleRunAllTests = useCallback(async () => {
    setIsRunning(true);
    try {
      const results: PlaygroundTestCase[] = [];
      for (const tc of testCases) {
        const d = await runTransform(script, tc.files);
        const out = d.output ?? d.error ?? "Compilation failed";
        const expected = tc.expectedOutput?.trim();
        const passed = Boolean(d.success) && (!expected || normalizeOutput(out) === normalizeOutput(expected));
        results.push({ ...tc, result: { status: passed ? "success" : "error", output: out, time: d.time ?? null } });
      }
      setTestCases(results);
    } catch (e: unknown) {
      setStatus("error"); setOutput(getErrorMessage(e, "Could not run tests."));
    } finally { setIsRunning(false); }
  }, [testCases, script, runTransform]);

  // ── Saved snippets ────────────────────────────────────────────────────────────
  const handleSaveSnippet = useCallback((name: string) => {
    const s: SavedSnippet = {
      id: createId("sn"), name, savedAt: Date.now(),
      script, files: cloneFiles(files),
    };
    setSavedSnippets((cur) => {
      const next = [s, ...cur];
      saveLS(LS_SNIPPETS, next);
      return next;
    });
  }, [script, files]);

  const handleLoadSnippet = useCallback((s: SavedSnippet) => {
    setScript(s.script); setFiles(s.files); setActiveFileId(s.files[0].id);
    setOutput(""); setStatus("idle"); setExecutionTime(null);
  }, []);

  const handleDeleteSnippet = useCallback((id: string) => {
    setSavedSnippets((cur) => {
      const next = cur.filter((s) => s.id !== id);
      saveLS(LS_SNIPPETS, next);
      return next;
    });
  }, []);

  // ── Execution history restore ─────────────────────────────────────────────────
  const handleRestoreHistory = useCallback((entry: ExecutionHistoryEntry) => {
    setScript(entry.script); setFiles(entry.files); setActiveFileId(entry.files[0].id);
    setOutput(entry.output); setStatus(entry.status);
    setExecutionTime(entry.time); setRightTab("output");
  }, []);

  // ── Sample library ────────────────────────────────────────────────────────────
  const handleLoadSample = useCallback((content: string, lang: PlaygroundFileLanguage, name: string) => {
    setFiles((cur) => cur.map((f) =>
      f.id === activeFileId ? { ...f, content, language: lang, name } : f
    ));
    setActiveInputTab("files");
  }, [activeFileId]);

  // ── Monaco mount ─────────────────────────────────────────────────────────────
  const handleEditorMount: OnMount = useCallback((_, monaco) => {
    registerDataWeaveLanguage(monaco);
  }, []);

  // ── Status badge ─────────────────────────────────────────────────────────────
  const statusBadge = status === "success"
    ? <Badge className="border-green-500/30 bg-green-500/15 text-green-500 hover:bg-green-500/15">Compiled</Badge>
    : status === "error"
      ? <Badge className="border-red-500/30 bg-red-500/15 text-red-500 hover:bg-red-500/15">Error</Badge>
      : null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] min-h-[36rem] flex-col">

      {/* ── Toolbar ── */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-2 py-2 sm:px-4">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">DataWeave Playground</span>
        <span className="hidden text-xs text-muted-foreground lg:inline">Write, run, and compare</span>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {statusBadge}
          {executionTime && (
            <span className="font-mono text-xs text-muted-foreground">{executionTime}</span>
          )}

          {/* Settings */}
          <PlaygroundSettings settings={settings} onChange={updateSettings} />

          {/* Share */}
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
            onClick={handleShare} disabled={isSharing}>
            {isSharing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              : shareCopied ? <Check className="mr-1 h-3.5 w-3.5 text-green-500" />
                : <Share2 className="mr-1 h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{shareCopied ? "Copied" : "Share"}</span>
          </Button>

          {/*
            Everything secondary lives behind one menu. Previously the toolbar held a
            layout toggle, an Export dropdown, a GitHub import button, an inline
            commit-message text input, a Commit button, Share, Reset and Run all at
            once, which left no room to breathe on anything narrower than a desktop.
          */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title="More actions"
                  aria-label="More actions"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() =>
                  updateSettings({
                    ...settings,
                    orientation: settings.orientation === "horizontal" ? "vertical" : "horizontal",
                  })
                }
              >
                {orientation === "horizontal"
                  ? <><LayoutPanelTop className="mr-2 h-3.5 w-3.5" /> Stack panels vertically</>
                  : <><Columns2 className="mr-2 h-3.5 w-3.5" /> Place panels side by side</>}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={handleReset} disabled={isRunning}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset playground
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Download</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => downloadTextFile("script.dwl", script)}>
                <Download className="mr-2 h-3.5 w-3.5" /> script.dwl
              </DropdownMenuItem>
              {files.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => downloadTextFile(f.name, f.content)}>
                  <Download className="mr-2 h-3.5 w-3.5" /> {f.name}
                </DropdownMenuItem>
              ))}
              {output && (
                <DropdownMenuItem onClick={() => downloadTextFile("output.txt", output)}>
                  <Download className="mr-2 h-3.5 w-3.5" /> output.txt
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>GitHub</DropdownMenuLabel>
              {githubConnected ? (
                <>
                  <DropdownMenuItem onClick={() => setShowGHImport(true)}>
                    <GitBranch className="mr-2 h-3.5 w-3.5" /> Import a file…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePublishToGitHub} disabled={isPublishing}>
                    {isPublishing
                      ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      : <GitBranch className="mr-2 h-3.5 w-3.5" />}
                    Commit to {githubUsername ? `${githubUsername}/${githubRepo}` : githubRepo}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  render={<a href="/api/auth/github?returnTo=/playground" />}
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" /> Connect GitHub
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Run — the one primary action */}
          <Button type="button" size="sm" className="h-7 border-0 bg-green-600 text-xs text-white hover:bg-green-700"
            onClick={handleRun} disabled={isRunning}>
            {isRunning
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /><span className="hidden sm:inline">Running</span></>
              : <><Play className="mr-1.5 h-3.5 w-3.5" /><span className="hidden sm:inline">Run</span></>}
          </Button>
        </div>
      </div>

      {/* GitHub publish result banner */}
      {publishResult && (
        <div className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs ${publishResult.error ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-600 dark:text-green-400"}`}>
          <GitBranch className="h-3.5 w-3.5" />
          <span>{publishResult.message}</span>
          {publishResult.url && (
            <a href={publishResult.url} target="_blank" rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 font-medium underline underline-offset-2">
              Open repository <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* ── Three-panel layout ── */}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation={orientation} className="h-full">

          {/* ── LEFT: Inputs + Tests + Samples + Snippets ── */}
          <ResizablePanel defaultSize={26} minSize={18}>
            <Tabs value={activeInputTab} onValueChange={setActiveInputTab} className="h-full gap-0">
              <div className="flex h-9 shrink-0 items-center border-b bg-muted/30 px-2">
                <TabsList variant="line" className="h-7">
                  <TabsTrigger value="files" className="text-xs px-2">Inputs</TabsTrigger>
                  <TabsTrigger value="tests" className="text-xs px-2">Tests</TabsTrigger>
                  <TabsTrigger value="samples" className="text-xs px-2">
                    <Database className="w-3 h-3 sm:mr-1" /><span className="hidden sm:inline">Samples</span>
                  </TabsTrigger>
                  <TabsTrigger value="snippets" className="text-xs px-2">
                    <Bookmark className="w-3 h-3 sm:mr-1" /><span className="hidden sm:inline">Snippets</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="files" className="min-h-0 flex-1">
                <div className="flex h-full min-h-0">
                  <div className="w-36 shrink-0 sm:w-48">
                    <FileExplorer
                      files={files} activeFileId={activeFile?.id ?? ""}
                      onAddFile={handleAddFile} onRemoveFile={handleRemoveFile}
                      onRenameFile={handleRenameFile} onChangeLanguage={handleChangeLanguage}
                      onSelectFile={setActiveFileId}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    {activeFile && (
                      <Editor height="100%"
                        language={activeFile.language === "yaml" ? "yaml"
                          : activeFile.language === "xml" ? "xml"
                            : activeFile.language === "csv" || activeFile.language === "text"
                              || activeFile.language === "ndjson" || activeFile.language === "multipart"
                              ? "plaintext"
                              : activeFile.language === "java" ? "java"
                                : "json"}
                        theme={editorTheme} value={activeFile.content}
                        onChange={(v) => handleUpdateFileContent(v ?? "")}
                        options={inputEditorOptions}
                      />
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="tests" className="min-h-0 flex-1">
                <TestRunner testCases={testCases} isRunning={isRunning}
                  onAddTest={handleAddTest}
                  onRemoveTest={(id) => setTestCases((c) => c.filter((t) => t.id !== id))}
                  onRenameTest={(id, name) => setTestCases((c) => c.map((t) => t.id === id ? { ...t, name } : t))}
                  onExpectedOutputChange={(id, expectedOutput) =>
                    setTestCases((c) => c.map((t) => t.id === id ? { ...t, expectedOutput } : t))}
                  onRunAll={handleRunAllTests}
                />
              </TabsContent>

              <TabsContent value="samples" className="min-h-0 flex-1">
                <SampleLibrary onLoad={handleLoadSample} />
              </TabsContent>

              <TabsContent value="snippets" className="min-h-0 flex-1">
                <SavedSnippets snippets={savedSnippets} currentScript={script}
                  currentFiles={files} onSave={handleSaveSnippet}
                  onLoad={handleLoadSnippet} onDelete={handleDeleteSnippet}
                />
              </TabsContent>
            </Tabs>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── CENTRE: DataWeave script editor ── */}
          <ResizablePanel defaultSize={44} minSize={25}>
            <div className="flex h-full flex-col">
              <div className="flex h-9 shrink-0 items-center border-b bg-muted/30 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  DataWeave Script
                </span>
                <Badge variant="outline" className="ml-2 py-0 text-[10px]">DWL</Badge>
              </div>
              <div className="min-h-0 flex-1">
                <Editor height="100%" language="dataweave" theme={editorTheme}
                  value={script} onMount={handleEditorMount}
                  onChange={(v) => setScript(v ?? "")}
                  options={editorOptions}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── RIGHT: Output + AI + History ── */}
          <ResizablePanel defaultSize={30} minSize={20}>
            <Tabs value={rightTab} onValueChange={setRightTab} className="h-full gap-0">
              <div className="flex h-9 shrink-0 items-center border-b bg-muted/30 px-2">
                <TabsList variant="line" className="h-7">
                  <TabsTrigger value="output" className="text-xs px-2">Output</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs px-2 gap-1">
                    <History className="w-3 h-3" /><span className="hidden sm:inline">History</span>
                  </TabsTrigger>
                </TabsList>
                {rightTab === "output" && output && (
                  <button className="ml-auto p-1" onClick={handleCopyOutput} title="Copy output">
                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                )}
              </div>

              <TabsContent value="output" className="min-h-0 flex-1">
                <div className="h-full overflow-auto p-4">
                  {isRunning ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Compiling…
                    </div>
                  ) : output ? (
                    <pre className={`whitespace-pre-wrap break-words font-mono text-sm ${status === "error" ? "text-red-400" : "text-green-400"}`}>{output}</pre>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      Click <span className="font-semibold text-foreground">Run</span> to see output here.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="history" className="min-h-0 flex-1">
                <ExecutionHistory
                  history={execHistory}
                  onRestore={handleRestoreHistory}
                  onClear={() => { setExecHistory([]); saveLS(LS_HISTORY, []); }}
                />
              </TabsContent>
            </Tabs>
          </ResizablePanel>

        </ResizablePanelGroup>
      </div>

      {/* GitHub import modal */}
      {showGHImport && (
        <GitHubImport onImport={handleGitHubImport} onClose={() => setShowGHImport(false)} />
      )}
    </div>
  );
}
