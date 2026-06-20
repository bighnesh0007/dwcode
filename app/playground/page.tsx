"use client";

import { useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Play, RotateCcw, Copy, Check, Loader2, Terminal } from "lucide-react";

const DEFAULT_SCRIPT = `%dw 2.0
output application/json
---
payload map (item) -> {
  id: item.id,
  name: upper(item.name)
}`;

const DEFAULT_INPUT = `[
  { "id": 1, "name": "alice" },
  { "id": 2, "name": "bob" }
]`;

export default function PlaygroundPage() {
    const { resolvedTheme } = useTheme();
    const editorTheme = resolvedTheme === "light" ? "vs-light" : "vs-dark";

    const [script, setScript] = useState(DEFAULT_SCRIPT);
    const [input, setInput] = useState(DEFAULT_INPUT);
    const [output, setOutput] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [executionTime, setExecutionTime] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const handleRun = async () => {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        setIsRunning(true);
        setStatus("idle");
        setOutput("");
        setExecutionTime(null);

        try {
            // Parse the input JSON string into an object so the backend gets
            // a real value, not a raw string. Fall back to the string on bad JSON.
            let parsedInput: unknown = input;
            try { parsedInput = JSON.parse(input); } catch { /* keep as string */ }

            const res = await fetch("/api/transform", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    script,
                    inputs: [{ name: "payload", value: parsedInput }],
                }),
                signal: abortRef.current.signal,
            });

            const data = await res.json();

            if (data.success) {
                setStatus("success");
                setOutput(data.output ?? "");
                setExecutionTime(data.time ?? null);
            } else {
                setStatus("error");
                setOutput(data.output ?? "Compilation failed");
                setExecutionTime(data.time ?? null);
            }
        } catch (err: any) {
            if (err.name !== "AbortError") {
                setStatus("error");
                setOutput(`Network error: ${err.message}`);
            }
        } finally {
            setIsRunning(false);
        }
    };

    const handleReset = () => {
        setScript(DEFAULT_SCRIPT);
        setInput(DEFAULT_INPUT);
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

    const statusBadge =
        status === "success"
            ? <Badge className="bg-green-500/15 text-green-500 border-green-500/30 hover:bg-green-500/15">Compiled</Badge>
            : status === "error"
                ? <Badge className="bg-red-500/15 text-red-500 border-red-500/30 hover:bg-red-500/15">Error</Badge>
                : null;

    return (
        <div className="h-[calc(100vh-3.5rem)] flex flex-col">
            {/* Toolbar */}
            <div className="h-12 border-b flex items-center px-4 gap-3 bg-muted/20 flex-shrink-0">
                <Terminal className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">DataWeave Playground</span>
                <span className="text-muted-foreground/50 text-xs">—</span>
                <span className="text-xs text-muted-foreground">Write, run, and experiment freely</span>

                <div className="ml-auto flex items-center gap-2">
                    {statusBadge}
                    {executionTime && (
                        <span className="text-xs text-muted-foreground font-mono">⏱ {executionTime}</span>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleReset}
                        disabled={isRunning}
                    >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                    </Button>
                    <Button
                        size="sm"
                        className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white border-0"
                        onClick={handleRun}
                        disabled={isRunning}
                    >
                        {isRunning ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running…</>
                        ) : (
                            <><Play className="w-3.5 h-3.5 mr-1.5" /> Run</>
                        )}
                    </Button>
                </div>
            </div>

            {/* Three-panel layout */}
            <div className="flex-1 min-h-0">
                <ResizablePanelGroup orientation="horizontal" className="h-full">

                    {/* Panel 1: Input */}
                    <ResizablePanel defaultSize={25} minSize={15}>
                        <div className="h-full flex flex-col">
                            <div className="h-9 border-b flex items-center px-3 bg-muted/30 flex-shrink-0">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Input Payload</span>
                                <Badge variant="outline" className="ml-2 text-[10px] py-0">JSON</Badge>
                            </div>
                            <div className="flex-1 min-h-0">
                                <Editor
                                    height="100%"
                                    language="json"
                                    theme={editorTheme}
                                    value={input}
                                    onChange={(v) => setInput(v || "")}
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
                            </div>
                        </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    {/* Panel 2: Script */}
                    <ResizablePanel defaultSize={45} minSize={25}>
                        <div className="h-full flex flex-col">
                            <div className="h-9 border-b flex items-center px-3 bg-muted/30 flex-shrink-0">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">DataWeave Script</span>
                                <Badge variant="outline" className="ml-2 text-[10px] py-0">DWL</Badge>
                            </div>
                            <div className="flex-1 min-h-0">
                                <Editor
                                    height="100%"
                                    language="plaintext"
                                    theme={editorTheme}
                                    value={script}
                                    onChange={(v) => setScript(v || "")}
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

                    {/* Panel 3: Output */}
                    <ResizablePanel defaultSize={30} minSize={15}>
                        <div className="h-full flex flex-col">
                            <div className="h-9 border-b flex items-center px-3 bg-muted/30 flex-shrink-0 gap-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output</span>
                                {statusBadge}
                                <div className="ml-auto">
                                    {output && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={handleCopyOutput}
                                            title="Copy output"
                                        >
                                            {copied
                                                ? <Check className="w-3 h-3 text-green-500" />
                                                : <Copy className="w-3 h-3" />}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto p-4">
                                {isRunning ? (
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Compiling…
                                    </div>
                                ) : output ? (
                                    <pre
                                        className={`font-mono text-sm whitespace-pre-wrap break-words ${status === "error" ? "text-red-400" : "text-green-400"
                                            }`}
                                    >
                                        {output}
                                    </pre>
                                ) : (
                                    <p className="text-muted-foreground italic text-xs">
                                        Click <span className="font-semibold text-foreground">Run</span> to see output here…
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
