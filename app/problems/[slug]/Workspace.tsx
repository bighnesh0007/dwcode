"use client";

import { useState, useEffect, useRef } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Send, RotateCcw, Star, Eye, EyeOff, Timer, PauseCircle, PlayCircle } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { Comments } from "@/components/Comments";
import { renderMarkdown } from "@/lib/markdown";
import { getErrorMessage } from "@/lib/errors";
import type { BookmarkSummary, Problem, SubmissionSummary } from "@/lib/types";

export default function Workspace({ problem }: { problem: Problem }) {
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === "light" ? "vs-light" : "vs-dark";

  const [code, setCode] = useState(problem.starterCode || "%dw 2.0\noutput application/json\n---\n");
  const [customInput, setCustomInput] = useState(problem.examples?.[0]?.input || "{}");
  const [output, setOutput] = useState("");
  const [outputStatus, setOutputStatus] = useState<"idle" | "success" | "error">("idle");
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("input");
  const [activeDescTab, setActiveDescTab] = useState("description");
  const [isMobileLayout, setIsMobileLayout] = useState(false);

  // Bookmark
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Note
  const [note, setNote] = useState("");
  const noteSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  // Solution reveal
  const [showSolution, setShowSolution] = useState(false);
  // Once the solution is viewed, we track it for the lifetime of this session.
  // Hiding it again does NOT reset this flag — the user already saw the answer.
  const [solutionWasViewed, setSolutionWasViewed] = useState(false);

  // Timer
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Submissions
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const updateLayout = () => setIsMobileLayout(media.matches);
    queueMicrotask(updateLayout);
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  // --- Timer ---
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // --- Bookmark ---
  useEffect(() => {
    fetch("/api/bookmarks").then(r => r.json()).then((data: BookmarkSummary[]) => {
      if (Array.isArray(data)) {
        setIsBookmarked(data.some(b => b.problemId === problem._id));
      }
    });
  }, [problem._id]);

  const toggleBookmark = async () => {
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemId: problem._id, problemSlug: problem.slug }),
    });
    const data = await res.json();
    if (data.success) setIsBookmarked(data.bookmarked);
  };

  // --- Notes ---
  useEffect(() => {
    fetch(`/api/notes?problemId=${problem._id}`).then(r => r.json()).then(data => {
      setNote(data.content || "");
    });
  }, [problem._id]);

  const handleNoteChange = (val: string) => {
    setNote(val);
    if (noteSaveTimeout.current) clearTimeout(noteSaveTimeout.current);
    noteSaveTimeout.current = setTimeout(() => {
      fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: problem._id, problemSlug: problem.slug, content: val }),
      });
    }, 800);
  };

  // --- Submissions ---
  useEffect(() => {
    fetch("/api/submissions").then(r => r.json()).then((data: SubmissionSummary[]) => {
      if (Array.isArray(data)) {
        setSubmissions(data.filter(s => s.problemSlug === problem.slug).slice(0, 5));
      }
    });
  }, [problem.slug]);

  // --- Run (custom input only, no submission recorded) ---
  const handleRun = async () => {
    setIsRunning(true);
    setOutputStatus("idle");
    setActiveTab("output");
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, input: customInput }),
      });
      const data = await res.json();
      setOutputStatus(data.success ? "success" : "error");
      setOutput(data.success ? `⏱ ${data.time}\n\n${data.output}` : `✗ Error:\n${data.output}`);
    } catch (error) {
      setOutputStatus("error");
      setOutput(`✗ Error: ${getErrorMessage(error)}`);
    } finally {
      setIsRunning(false);
    }
  };

  // --- Submit (test-case comparison → real status) ---
  const handleSubmit = async () => {
    setIsRunning(true);
    setOutputStatus("idle");
    setActiveTab("output");
    setOutput("⏳ Evaluating test cases…");

    // ── Solution-copy guard ──────────────────────────────────────────────
    // Only block credit when the user actually revealed the solution. We do
    // NOT compare code against the stored solution: for many DataWeave
    // problems there is a single idiomatic answer, so a legitimate solve
    // naturally matches the canonical solution and would be falsely blocked.
    if (solutionWasViewed) {
      setIsRunning(false);
      setOutputStatus("error");
      setOutput(
        "⚠ Submission blocked\n\n" +
        "You viewed the solution for this problem, so this submission won't be counted as solved.\n\n" +
        "Close this problem, reload the page, and solve it without peeking to earn credit."
      );
      return;
    }
    // ────────────────────────────────────────────────────────────────────

    try {
      // 1. Run against custom input for display
      const runRes = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, input: customInput }),
      });
      const runData = await runRes.json();

      // 2. Determine actual status by checking test cases
      const testCases: { input: string; expectedOutput: string }[] =
        problem.testCases?.length ? problem.testCases
          : problem.examples?.length ? [{ input: problem.examples[0].input, expectedOutput: problem.examples[0].output }]
            : [];

      let finalStatus: "Accepted" | "Attempted" | "Error" = "Attempted";
      let testResultSummary = "";

      if (!runData.success) {
        finalStatus = "Error";
        testResultSummary = `✗ Compilation Error:\n${runData.output}`;
      } else if (testCases.length === 0) {
        // No test cases — can't verify, mark Attempted
        finalStatus = "Attempted";
        testResultSummary = `⚠ No test cases defined. Cannot verify correctness.\n\n${runData.output}`;
      } else {
        // Run each test case
        let allPassed = true;
        const lines: string[] = [];

        for (let i = 0; i < testCases.length; i++) {
          const tc = testCases[i];
          const tcRes = await fetch("/api/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, input: tc.input }),
          });
          const tcData = await tcRes.json();

          if (!tcData.success) {
            allPassed = false;
            finalStatus = "Error";
            lines.push(`Test ${i + 1}: ✗ Error — ${tcData.output}`);
            break;
          }

          const normalize = (s: string) => {
            try {
              // Try to normalise JSON so whitespace differences don't matter
              return JSON.stringify(JSON.parse(s.trim()));
            } catch {
              return s.trim();
            }
          };

          const actual = normalize(tcData.output);
          const expected = normalize(tc.expectedOutput);
          const passed = actual === expected;

          if (!passed) allPassed = false;
          lines.push(
            `Test ${i + 1}: ${passed ? "✓ Passed" : "✗ Failed"}\n  Expected: ${tc.expectedOutput.slice(0, 120)}\n  Got:      ${tcData.output.slice(0, 120)}`
          );
        }

        if (finalStatus !== "Error") {
          finalStatus = allPassed ? "Accepted" : "Attempted";
        }
        testResultSummary = lines.join("\n\n");
      }

      setOutputStatus(finalStatus === "Accepted" ? "success" : "error");
      const statusEmoji = finalStatus === "Accepted" ? "✅ Accepted" : finalStatus === "Error" ? "✗ Error" : "✗ Wrong Answer";
      setOutput(`${statusEmoji}\n\n${testResultSummary}`);

      // 3. Save submission with correct status
      await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem._id,
          problemSlug: problem.slug,
          code,
          input: customInput,
          output: runData.output || "",
          status: finalStatus,
          executionTime: runData.time || "0ms",
        }),
      });

      // 4. Persist accepted solves to localStorage for guests
      if (finalStatus === "Accepted") {
        try {
          const raw = localStorage.getItem("dwcode_guest_progress");
          const existing: string[] = raw ? JSON.parse(raw) : [];
          if (!existing.includes(problem.slug)) {
            existing.push(problem.slug);
            localStorage.setItem("dwcode_guest_progress", JSON.stringify(existing));
          }
        } catch {
          // localStorage unavailable (private mode, SSR guard) — fail silently
        }
      }

      // Refresh history
      fetch("/api/submissions").then(r => r.json()).then((d: SubmissionSummary[]) => {
        if (Array.isArray(d)) {
          setSubmissions(d.filter(s => s.problemSlug === problem.slug).slice(0, 5));
        }
      });
    } catch (error) {
      setOutputStatus("error");
      setOutput(`✗ Error: ${getErrorMessage(error)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const outputClass = outputStatus === "success"
    ? "text-green-400"
    : outputStatus === "error"
      ? "text-red-400"
      : "text-muted-foreground";

  return (
    <ResizablePanelGroup
      orientation={isMobileLayout ? "vertical" : "horizontal"}
      className="flex-1 w-full border-t"
    >
      {/* LEFT: Description Panel */}
      <ResizablePanel defaultSize={38} minSize={25}>
        <div className="h-full flex flex-col bg-card">
          {/* Problem Header */}
          <div className="px-5 pt-5 pb-3 border-b flex-shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold leading-tight">{problem.title}</h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="outline" className={
                    problem.difficulty === "Easy" ? "text-green-500 border-green-500/50 bg-green-500/10" :
                      problem.difficulty === "Medium" ? "text-yellow-500 border-yellow-500/50 bg-yellow-500/10" :
                        "text-red-500 border-red-500/50 bg-red-500/10"
                  }>
                    {problem.difficulty}
                  </Badge>
                  {problem.tags?.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleBookmark}
                className={isBookmarked ? "text-yellow-400 hover:text-yellow-500" : "text-muted-foreground hover:text-yellow-400"}
              >
                <Star className="w-5 h-5" fill={isBookmarked ? "currentColor" : "none"} />
              </Button>
            </div>
          </div>

          {/* Tabs: Description / Notes / Submissions */}
          <Tabs value={activeDescTab} onValueChange={setActiveDescTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="h-10 flex-shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent px-2 sm:gap-2 sm:px-4">
              <TabsTrigger value="description" className="text-xs rounded-sm data-[state=active]:bg-muted">
                Description
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-xs rounded-sm data-[state=active]:bg-muted">
                My Notes
              </TabsTrigger>
              <TabsTrigger value="submissions" className="text-xs rounded-sm data-[state=active]:bg-muted">
                History
              </TabsTrigger>
              <TabsTrigger value="comments" className="text-xs rounded-sm data-[state=active]:bg-muted">
                Discussion
              </TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="flex-1 overflow-y-auto px-5 py-4 mt-0 space-y-5">
              <div
                className="text-sm leading-relaxed text-foreground/90 prose prose-sm dark:prose-invert max-w-none break-words"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(problem.description || "") }}
              />

              {problem.examples?.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold">Examples</p>
                  {problem.examples.map((ex, i) => (
                    <div key={i} className="bg-muted/60 rounded-lg p-3 text-xs font-mono space-y-1">
                      <div><span className="font-bold text-foreground/60">Input: </span><span className="whitespace-pre-wrap">{ex.input}</span></div>
                      <div><span className="font-bold text-foreground/60">Output: </span><span className="whitespace-pre-wrap">{ex.output}</span></div>
                      {ex.explanation && <div className="text-muted-foreground italic pt-1">{ex.explanation}</div>}
                    </div>
                  ))}
                </div>
              )}

              {problem.constraints?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Constraints</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                    {problem.constraints.map((c: string, i: number) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              {(problem.hints?.length ?? 0) > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Hints</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                    {problem.hints?.map((hint, i) => <li key={i}>{hint}</li>)}
                  </ul>
                </div>
              )}

              {problem.solution && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      const next = !showSolution;
                      setShowSolution(next);
                      // Mark solution as viewed the moment user opens it
                      if (next) setSolutionWasViewed(true);
                    }}
                  >
                    {showSolution ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide Solution</> : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Reveal Solution</>}
                  </Button>
                  {!solutionWasViewed && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ⚠ Revealing the solution will disable submission credit for this session.
                    </p>
                  )}
                  {solutionWasViewed && (
                    <p className="text-xs text-yellow-500 mt-2">
                      Solution viewed — submissions are disabled for this session.
                    </p>
                  )}
                  {showSolution && (
                    <div className="mt-3 bg-muted/60 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap border border-border">
                      {problem.solution}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="notes" className="flex-1 flex flex-col min-h-0 px-5 py-4 mt-0">
              <p className="text-xs text-muted-foreground mb-2">Saved automatically</p>
              <textarea
                className="flex-1 w-full rounded-md border border-input bg-muted/30 p-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Write your notes here... (auto-saved)"
                value={note}
                onChange={e => handleNoteChange(e.target.value)}
              />
            </TabsContent>

            <TabsContent value="submissions" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
              {submissions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No submissions yet. Run your code!</p>
              ) : (
                <div className="space-y-3">
                  {submissions.map((s, i) => (
                    <div key={i} className="border rounded-md p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${s.status === "Accepted" ? "text-green-500" : s.status === "Error" ? "text-red-500" : "text-yellow-500"}`}>
                          {s.status}
                        </span>
                        <span className="text-muted-foreground">{s.executionTime} · {new Date(s.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <pre className="bg-muted/50 rounded p-2 text-xs overflow-auto max-h-24 font-mono">{s.output?.slice(0, 300)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="comments" className="flex-1 overflow-y-auto mt-0">
              <Comments problemSlug={problem.slug} />
            </TabsContent>
          </Tabs>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* RIGHT: Editor + Console */}
      <ResizablePanel defaultSize={62} minSize={30}>
        <ResizablePanelGroup orientation="vertical">
          {/* Editor */}
          <ResizablePanel defaultSize={65} minSize={30}>
            <div className="h-full flex flex-col">
              {/* Editor toolbar */}
              <div className="flex min-h-10 flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-2 py-1 sm:px-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">DataWeave 2.0</span>
                  {isRunning && (
                    <span className="text-xs text-primary animate-pulse">● Running…</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Timer */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground border rounded px-2 py-0.5">
                    <Timer className="w-3 h-3" />
                    <span className="font-mono">{formatTime(seconds)}</span>
                    <button onClick={() => setTimerRunning(!timerRunning)} className="hover:text-foreground">
                      {timerRunning ? <PauseCircle className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />}
                    </button>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCode(problem.starterCode || "%dw 2.0\noutput application/json\n---\n")}>
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  height="100%"
                  defaultLanguage="plaintext"
                  theme={editorTheme}
                  value={code}
                  onChange={(val) => setCode(val || "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: "on",
                    padding: { top: 8 },
                  }}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Console */}
          <ResizablePanel defaultSize={35} minSize={15}>
            <div className="h-full flex flex-col">
              {/* Console toolbar */}
              <div className="h-10 border-b flex items-center justify-between px-4 bg-muted/30 flex-shrink-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
                  <TabsList className="h-full bg-transparent p-0 gap-2">
                    <TabsTrigger value="input" className="text-xs rounded-sm data-[state=active]:bg-muted">
                      Input
                    </TabsTrigger>
                    <TabsTrigger value="output" className="text-xs rounded-sm data-[state=active]:bg-muted">
                      Output
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleRun} disabled={isRunning} className="h-7 text-xs">
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                    Run
                  </Button>
                  <Button size="sm" onClick={handleSubmit} disabled={isRunning} className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white border-0">
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Submit
                  </Button>
                </div>
              </div>

              {/* Console content */}
              <div className="flex-1 min-h-0">
                {activeTab === "input" && (
                  <div className="h-full">
                    <Editor
                      height="100%"
                      defaultLanguage="json"
                      theme={editorTheme}
                      value={customInput}
                      onChange={(val) => setCustomInput(val || "")}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: "off",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        wordWrap: "on",
                        padding: { top: 8 },
                      }}
                    />
                  </div>
                )}
                {activeTab === "output" && (
                  <div className="h-full overflow-auto p-4 font-mono text-sm">
                    {output ? (
                      <pre className={outputClass}>{output}</pre>
                    ) : (
                      <p className="text-muted-foreground italic text-xs">Run your code to see output here…</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
