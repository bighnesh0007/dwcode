"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import {
  Check,
  Columns2,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  LayoutPanelTop,
  Loader2,
  Play,
  RotateCcw,
  Share2,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileExplorer } from "./components/FileExplorer";
import { TestRunner } from "./components/TestRunner";
import { registerDataWeaveLanguage } from "./monarch";
import type { PlaygroundFile, PlaygroundTestCase } from "./types";

const DEFAULT_SCRIPT = `%dw 2.0
output application/json
---
payload map (item) -> {
  id: item.id,
  name: upper(item.name)
}`;

const DEFAULT_FILES: PlaygroundFile[] = [
  {
    id: "payload",
    name: "payload.json",
    kind: "payload",
    language: "json",
    content: `[
  { "id": 1, "name": "alice" },
  { "id": 2, "name": "bob" }
]`,
  },
  {
    id: "vars",
    name: "vars.json",
    kind: "vars",
    language: "json",
    content: "{}",
  },
  {
    id: "attributes",
    name: "attributes.json",
    kind: "attributes",
    language: "json",
    content: "{}",
  },
];

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function cloneFiles(files: PlaygroundFile[]) {
  return files.map((file) => ({ ...file }));
}

function getKindFromName(name: string): PlaygroundFile["kind"] {
  const stem = name.toLowerCase().replace(/\.[^.]+$/, "");

  if (stem === "payload") return "payload";
  if (stem === "vars") return "vars";
  if (stem === "attributes") return "attributes";
  return "custom";
}

function getLanguageFromName(name: string): PlaygroundFile["language"] {
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith(".xml")) return "xml";
  if (lowerName.endsWith(".csv")) return "csv";
  if (lowerName.endsWith(".txt")) return "text";
  return "json";
}

function getInputName(file: PlaygroundFile) {
  const stem = file.name.replace(/\.[^.]+$/, "").trim();
  return stem || file.kind || "payload";
}

function parseFileContent(file: PlaygroundFile) {
  if (file.language !== "json") return file.content;

  try {
    return JSON.parse(file.content);
  } catch {
    return file.content;
  }
}

function buildTransformInputs(files: PlaygroundFile[]) {
  return files.map((file) => ({
    name: getInputName(file),
    value: parseFileContent(file),
  }));
}

function normalizeOutput(value: string) {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value.trim();
  }
}

function downloadTextFile(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function PlaygroundPage() {
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === "light" ? "vs-light" : "vs-dark";

  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [files, setFiles] = useState<PlaygroundFile[]>(() =>
    cloneFiles(DEFAULT_FILES)
  );
  const [activeFileId, setActiveFileId] = useState(DEFAULT_FILES[0].id);
  const [activeInputTab, setActiveInputTab] = useState("files");
  const [testCases, setTestCases] = useState<PlaygroundTestCase[]>([]);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [executionTime, setExecutionTime] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState("");
  const [githubRepo, setGithubRepo] = useState("dwcode-workspace");
  const [commitMessage, setCommitMessage] = useState("DataWeave playground run");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    message: string;
    url?: string;
    error?: boolean;
  } | null>(null);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    "horizontal"
  );
  const abortRef = useRef<AbortController | null>(null);

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? files[0],
    [activeFileId, files]
  );

  useEffect(() => {
    const snippetId = new URLSearchParams(window.location.search).get("id");
    if (!snippetId) return;

    let isCancelled = false;

    async function loadSnippet() {
      try {
        const response = await fetch(`/api/playground/share?id=${snippetId}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error ?? "Snippet not found.");
        if (isCancelled) return;

        const loadedFiles = Array.isArray(data.files) && data.files.length
          ? data.files.map((file: Partial<PlaygroundFile>, index: number) => ({
            id: createId(`file-${index}`),
            name: file.name ?? `input-${index + 1}.json`,
            kind: file.kind ?? getKindFromName(file.name ?? ""),
            language: file.language ?? getLanguageFromName(file.name ?? ""),
            content: file.content ?? "",
          }))
          : cloneFiles(DEFAULT_FILES);

        setScript(data.script ?? DEFAULT_SCRIPT);
        setFiles(loadedFiles);
        setActiveFileId(loadedFiles[0].id);
        setTestCases(
          Array.isArray(data.testCases)
            ? data.testCases.map(
              (testCase: Partial<PlaygroundTestCase>, index: number) => ({
                id: createId(`test-${index}`),
                name: testCase.name ?? `Test ${index + 1}`,
                files: Array.isArray(testCase.files)
                  ? testCase.files.map(
                    (file: Partial<PlaygroundFile>, fileIndex: number) => ({
                      id: createId(`test-file-${fileIndex}`),
                      name: file.name ?? `input-${fileIndex + 1}.json`,
                      kind: file.kind ?? getKindFromName(file.name ?? ""),
                      language:
                        file.language ?? getLanguageFromName(file.name ?? ""),
                      content: file.content ?? "",
                    })
                  )
                  : cloneFiles(loadedFiles),
                expectedOutput: testCase.expectedOutput ?? "",
              })
            )
            : []
        );
        setStatus("idle");
        setOutput("");
        setExecutionTime(null);
      } catch (error: unknown) {
        setStatus("error");
        setOutput(getErrorMessage(error, "Could not load shared snippet."));
      }
    }

    loadSnippet();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncOrientation = () => {
      if (media.matches) setOrientation("vertical");
    };
    syncOrientation();
    media.addEventListener("change", syncOrientation);

    fetch("/api/github/status")
      .then((response) => response.json())
      .then((data) => {
        setGithubConnected(Boolean(data.connected));
        setGithubUsername(data.username || "");
        setGithubRepo(data.repoName || "dwcode-workspace");
      })
      .catch(() => {});

    return () => media.removeEventListener("change", syncOrientation);
  }, []);

  const runTransform = async (
    runScript: string,
    runFiles: PlaygroundFile[],
    signal?: AbortSignal
  ) => {
    const response = await fetch("/api/transform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: runScript,
        inputs: buildTransformInputs(runFiles),
      }),
      signal,
    });

    return response.json();
  };

  const handleEditorMount: OnMount = (_, monaco) => {
    registerDataWeaveLanguage(monaco);
  };

  const handleRun = async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsRunning(true);
    setStatus("idle");
    setOutput("");
    setExecutionTime(null);

    try {
      const data = await runTransform(script, files, abortRef.current.signal);

      if (data.success) {
        setStatus("success");
        setOutput(data.output ?? "");
        setExecutionTime(data.time ?? null);
      } else {
        setStatus("error");
        setOutput(data.output ?? "Compilation failed");
        setExecutionTime(data.time ?? null);
      }
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStatus("error");
        setOutput(`Network error: ${getErrorMessage(error, "Request failed.")}`);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    const resetFiles = cloneFiles(DEFAULT_FILES);
    setScript(DEFAULT_SCRIPT);
    setFiles(resetFiles);
    setActiveFileId(resetFiles[0].id);
    setTestCases([]);
    setOutput("");
    setStatus("idle");
    setExecutionTime(null);
  };

  const handleCopyOutput = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddFile = () => {
    const nextIndex = files.length + 1;
    const file: PlaygroundFile = {
      id: createId("file"),
      name: `input-${nextIndex}.json`,
      kind: "custom",
      language: "json",
      content: "{}",
    };

    setFiles((currentFiles) => [...currentFiles, file]);
    setActiveFileId(file.id);
  };

  const handleRemoveFile = (id: string) => {
    setFiles((currentFiles) => {
      if (currentFiles.length <= 1) return currentFiles;

      const nextFiles = currentFiles.filter((file) => file.id !== id);
      if (activeFileId === id) setActiveFileId(nextFiles[0].id);
      return nextFiles;
    });
  };

  const handleRenameFile = (id: string, name: string) => {
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.id === id
          ? {
            ...file,
            name,
            kind: getKindFromName(name),
            language: getLanguageFromName(name),
          }
          : file
      )
    );
  };

  const handleUpdateFileContent = (content: string) => {
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.id === activeFileId ? { ...file, content } : file
      )
    );
  };

  const handleShare = async () => {
    setIsSharing(true);

    try {
      const response = await fetch("/api/playground/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          files,
          testCases,
        }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Could not share snippet.");

      const url = `${window.location.origin}/playground?id=${data.id}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (error: unknown) {
      setStatus("error");
      setOutput(getErrorMessage(error, "Could not create share link."));
    } finally {
      setIsSharing(false);
    }
  };

  const handleAddTest = () => {
    const testCase: PlaygroundTestCase = {
      id: createId("test"),
      name: `Test ${testCases.length + 1}`,
      files: cloneFiles(files),
      expectedOutput: "",
    };
    setTestCases((currentTests) => [...currentTests, testCase]);
    setActiveInputTab("tests");
  };

  const handlePublishToGitHub = async () => {
    setIsPublishing(true);
    setPublishResult(null);
    try {
      const response = await fetch("/api/playground/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          files,
          testCases,
          output,
          message: commitMessage,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "GitHub publish failed.");
      setPublishResult({
        message: `Published to ${data.repo}`,
        url: data.url,
      });
    } catch (error) {
      setPublishResult({
        message: getErrorMessage(error, "GitHub publish failed."),
        error: true,
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRunAllTests = async () => {
    setIsRunning(true);

    try {
      const results: PlaygroundTestCase[] = [];

      for (const testCase of testCases) {
        const data = await runTransform(script, testCase.files);
        const outputText = data.output ?? data.error ?? "Compilation failed";
        const expected = testCase.expectedOutput?.trim();
        const passed =
          Boolean(data.success) &&
          (!expected || normalizeOutput(outputText) === normalizeOutput(expected));

        results.push({
          ...testCase,
          result: {
            status: passed ? "success" : "error",
            output: outputText,
            time: data.time ?? null,
          },
        });
      }

      setTestCases(results);
    } catch (error: unknown) {
      setStatus("error");
      setOutput(getErrorMessage(error, "Could not run tests."));
    } finally {
      setIsRunning(false);
    }
  };

  const statusBadge =
    status === "success" ? (
      <Badge className="border-green-500/30 bg-green-500/15 text-green-500 hover:bg-green-500/15">
        Compiled
      </Badge>
    ) : status === "error" ? (
      <Badge className="border-red-500/30 bg-red-500/15 text-red-500 hover:bg-red-500/15">
        Error
      </Badge>
    ) : null;

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] min-h-[36rem] flex-col">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-2 py-2 sm:px-4">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">DataWeave Playground</span>
        <span className="hidden text-xs text-muted-foreground lg:inline">Write, run, and compare</span>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {statusBadge}
          {executionTime && (
            <span className="font-mono text-xs text-muted-foreground">
              {executionTime}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              setOrientation((current) =>
                current === "horizontal" ? "vertical" : "horizontal"
              )
            }
            title={
              orientation === "horizontal"
                ? "Use vertical layout"
                : "Use horizontal layout"
            }
          >
            {orientation === "horizontal" ? (
              <LayoutPanelTop className="h-3.5 w-3.5" />
            ) : (
              <Columns2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => downloadTextFile("script.dwl", script)}>
                script.dwl
              </DropdownMenuItem>
              {files.map((file) => (
                <DropdownMenuItem
                  key={file.id}
                  onClick={() => downloadTextFile(file.name, file.content)}
                >
                  {file.name}
                </DropdownMenuItem>
              ))}
              {output && (
                <DropdownMenuItem
                  onClick={() => downloadTextFile("output.json", output)}
                >
                  output.json
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {githubConnected ? (
            <>
              <Input
                aria-label="GitHub commit message"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                className="hidden h-7 w-48 text-xs lg:block"
                placeholder="Commit message"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handlePublishToGitHub}
                disabled={isPublishing}
                title={`Publish a timestamped project to ${githubUsername}/${githubRepo}`}
              >
                {isPublishing ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitBranch className="mr-1 h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Commit</span>
              </Button>
            </>
          ) : (
            <Button
              render={<a href="/api/auth/github?returnTo=/playground" />}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
            >
              <GitBranch className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Connect GitHub</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleShare}
            disabled={isSharing}
          >
            {isSharing ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : shareCopied ? (
              <Check className="mr-1 h-3.5 w-3.5 text-green-500" />
            ) : (
              <Share2 className="mr-1 h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{shareCopied ? "Copied" : "Share"}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleReset}
            disabled={isRunning}
          >
            <RotateCcw className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 border-0 bg-green-600 text-xs text-white hover:bg-green-700"
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Running</span>
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                <span className="hidden sm:inline">Run</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {publishResult && (
        <div
          className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs ${
            publishResult.error
              ? "bg-red-500/10 text-red-500"
              : "bg-green-500/10 text-green-600 dark:text-green-400"
          }`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span>{publishResult.message}</span>
          {publishResult.url && (
            <a
              href={publishResult.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              Open repository <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation={orientation} className="h-full">
          <ResizablePanel defaultSize={28} minSize={18}>
            <Tabs
              value={activeInputTab}
              onValueChange={setActiveInputTab}
              className="h-full gap-0"
            >
              <div className="flex h-9 shrink-0 items-center border-b bg-muted/30 px-3">
                <TabsList variant="line" className="h-7">
                  <TabsTrigger value="files" className="text-xs">
                    Files
                  </TabsTrigger>
                  <TabsTrigger value="tests" className="text-xs">
                    Tests
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="files" className="min-h-0 flex-1">
                <div className="flex h-full min-h-0">
                  <div className="w-32 shrink-0 sm:w-44">
                    <FileExplorer
                      files={files}
                      activeFileId={activeFile?.id ?? ""}
                      onAddFile={handleAddFile}
                      onRemoveFile={handleRemoveFile}
                      onRenameFile={handleRenameFile}
                      onSelectFile={setActiveFileId}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    {activeFile && (
                      <Editor
                        height="100%"
                        language={activeFile.language}
                        theme={editorTheme}
                        value={activeFile.content}
                        onChange={(value) => handleUpdateFileContent(value ?? "")}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          lineNumbers: "on",
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          wordWrap: "on",
                          padding: { top: 8 },
                          tabSize: 2,
                        }}
                      />
                    )}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="tests" className="min-h-0 flex-1">
                <TestRunner
                  testCases={testCases}
                  isRunning={isRunning}
                  onAddTest={handleAddTest}
                  onRemoveTest={(id) =>
                    setTestCases((currentTests) =>
                      currentTests.filter((testCase) => testCase.id !== id)
                    )
                  }
                  onRenameTest={(id, name) =>
                    setTestCases((currentTests) =>
                      currentTests.map((testCase) =>
                        testCase.id === id ? { ...testCase, name } : testCase
                      )
                    )
                  }
                  onExpectedOutputChange={(id, expectedOutput) =>
                    setTestCases((currentTests) =>
                      currentTests.map((testCase) =>
                        testCase.id === id
                          ? { ...testCase, expectedOutput }
                          : testCase
                      )
                    )
                  }
                  onRunAll={handleRunAllTests}
                />
              </TabsContent>
            </Tabs>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={44} minSize={25}>
            <div className="flex h-full flex-col">
              <div className="flex h-9 shrink-0 items-center border-b bg-muted/30 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  DataWeave Script
                </span>
                <Badge variant="outline" className="ml-2 py-0 text-[10px]">
                  DWL
                </Badge>
              </div>
              <div className="min-h-0 flex-1">
                <Editor
                  height="100%"
                  language="dataweave"
                  theme={editorTheme}
                  value={script}
                  onMount={handleEditorMount}
                  onChange={(value) => setScript(value ?? "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: "on",
                    padding: { top: 8 },
                    tabSize: 2,
                  }}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={28} minSize={18}>
            <div className="flex h-full flex-col">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Output
                </span>
                {statusBadge}
                <div className="ml-auto">
                  {output && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleCopyOutput}
                      title="Copy output"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {isRunning ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Compiling
                  </div>
                ) : output ? (
                  <pre
                    className={`whitespace-pre-wrap break-words font-mono text-sm ${
                      status === "error" ? "text-red-400" : "text-green-400"
                    }`}
                  >
                    {output}
                  </pre>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Click <span className="font-semibold text-foreground">Run</span>{" "}
                    to see output here.
                  </p>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
