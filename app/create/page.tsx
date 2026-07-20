"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { getErrorMessage } from "@/lib/errors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Sparkles, Loader2, Coins, KeyRound } from "lucide-react";

const EMPTY = {
    title: "", description: "", input: "{}", output: "{}",
    tags: "", difficulty: "Medium", category: "Arrays",
    starterCode: "%dw 2.0\noutput application/json\n---\n", solution: "",
};

export default function CreatePage() {
    const router = useRouter();
    const { isSignedIn } = useAuth();
    const [tab, setTab] = useState<"manual" | "ai">("manual");

    // Manual form
    const [form, setForm] = useState(EMPTY);
    const [creating, setCreating] = useState(false);
    const [createMsg, setCreateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // AI form
    const [aiKey, setAiKey] = useState("");
    const [aiDifficulty, setAiDifficulty] = useState("Medium");
    const [aiCategory, setAiCategory] = useState("Arrays");
    const [aiTopic, setAiTopic] = useState("");
    const [generating, setGenerating] = useState(false);
    const [aiMsg, setAiMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    if (!isSignedIn) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
                <p>Sign in to create a problem.</p>
                <Link href="/sign-in"><Button>Sign In</Button></Link>
            </div>
        );
    }

    const handleManual = async () => {
        if (!form.title.trim() || !form.description.trim()) {
            setCreateMsg({ type: "error", text: "Title and description are required." });
            return;
        }
        setCreating(true);
        setCreateMsg(null);
        try {
            const payload = {
                title: form.title,
                description: form.description,
                examples: [{ input: form.input, output: form.output, explanation: "" }],
                tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
                difficulty: form.difficulty,
                category: form.category,
                starterCode: form.starterCode,
                solution: form.solution,
            };
            const res = await fetch("/api/problems", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                setCreateMsg({ type: "success", text: `✓ Created "${form.title}"! +2 coins earned.` });
                setForm(EMPTY);
                setTimeout(() => router.push(`/problems/${data.problem.slug}`), 1500);
            } else {
                setCreateMsg({ type: "error", text: data.error || "Failed to create." });
            }
        } catch (error) {
            setCreateMsg({ type: "error", text: getErrorMessage(error) });
        } finally {
            setCreating(false);
        }
    };

    const handleAI = async () => {
        if (!aiKey.trim()) {
            setAiMsg({ type: "error", text: "Enter your Gemini API key to use AI generation." });
            return;
        }
        setGenerating(true);
        setAiMsg(null);
        try {
            const res = await fetch("/api/generate-public", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: aiDifficulty,
                    category: aiCategory,
                    topic: aiTopic,
                    geminiApiKey: aiKey,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setAiMsg({ type: "success", text: `✓ Generated "${data.problem.title}"! +2 coins earned.` });
                setAiKey(""); // clear key after use
                setTimeout(() => router.push(`/problems/${data.problem.slug}`), 1500);
            } else {
                setAiMsg({ type: "error", text: data.error || "AI generation failed." });
            }
        } catch (error) {
            setAiMsg({ type: "error", text: getErrorMessage(error) });
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="container max-w-screen-md mx-auto py-10 px-4 space-y-6">
            <Link href="/problems" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
                <ArrowLeft className="w-4 h-4" /> Back to Problems
            </Link>

            <div className="flex items-center gap-3">
                <Plus className="w-6 h-6 text-primary" />
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Create a Problem</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">Share a DataWeave challenge with the community.</p>
                </div>
                <Badge variant="outline" className="ml-auto text-xs gap-1 text-yellow-500 border-yellow-500/30 bg-yellow-500/10">
                    <Coins className="w-3 h-3" /> +2 coins on create
                </Badge>
            </div>

            <Tabs
                value={tab}
                onValueChange={(value) => {
                    if (value === "manual" || value === "ai") setTab(value);
                }}
            >
                <TabsList className="w-full">
                    <TabsTrigger value="manual" className="flex-1">
                        <Plus className="w-3.5 h-3.5 mr-1.5" /> Manual
                    </TabsTrigger>
                    <TabsTrigger value="ai" className="flex-1">
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Generate
                    </TabsTrigger>
                </TabsList>

                {/* Manual */}
                <TabsContent value="manual">
                    <Card>
                        <CardContent className="space-y-4 pt-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Title *</label>
                                <Input placeholder="e.g. Filter active users from payload"
                                    value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Description *</label>
                                <Textarea placeholder="Describe what the DataWeave script should do…"
                                    rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Example Input</label>
                                    <Textarea className="font-mono text-xs" placeholder='{"users": [...]}' rows={4}
                                        value={form.input} onChange={e => setForm(f => ({ ...f, input: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Expected Output</label>
                                    <Textarea className="font-mono text-xs" placeholder='[{"name": "..."}]' rows={4}
                                        value={form.output} onChange={e => setForm(f => ({ ...f, output: e.target.value }))} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Difficulty *</label>
                                    <Select value={form.difficulty} onValueChange={v => v && setForm(f => ({ ...f, difficulty: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {["Easy", "Medium", "Hard"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Tags <span className="text-muted-foreground font-normal">(comma separated)</span></label>
                                    <Input placeholder="JSON, map, filter" value={form.tags}
                                        onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Starter Code</label>
                                <Textarea className="font-mono text-sm" rows={4} value={form.starterCode}
                                    onChange={e => setForm(f => ({ ...f, starterCode: e.target.value }))} />
                            </div>
                            {createMsg && (
                                <p className={`text-sm ${createMsg.type === "success" ? "text-green-500" : "text-red-500"}`}>
                                    {createMsg.text}
                                </p>
                            )}
                            <Button className="w-full" onClick={handleManual}
                                disabled={creating || !form.title.trim() || !form.description.trim()}>
                                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                Create Problem
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* AI */}
                <TabsContent value="ai">
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" /> Generate with Gemini AI
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Provide your own Gemini API key. It is used for a single request and never stored.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium flex items-center gap-1.5">
                                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                                    Gemini API Key *
                                </label>
                                <Input
                                    type="password"
                                    placeholder="AIza…"
                                    value={aiKey}
                                    onChange={e => setAiKey(e.target.value)}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Get a free key at{" "}
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener"
                                        className="text-primary hover:underline">
                                        aistudio.google.com
                                    </a>
                                    . Key is discarded after use.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Difficulty</label>
                                    <Select value={aiDifficulty} onValueChange={v => v && setAiDifficulty(v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {["Easy", "Medium", "Hard"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Category</label>
                                    <Select value={aiCategory} onValueChange={v => v && setAiCategory(v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {["Arrays", "Objects", "Strings", "Transformations", "XML", "Core Functions"].map(c => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Topic Hint <span className="text-muted-foreground font-normal">(optional)</span></label>
                                <Input placeholder="e.g. group orders by region using groupBy…"
                                    value={aiTopic} onChange={e => setAiTopic(e.target.value)} />
                            </div>
                            {aiMsg && (
                                <p className={`text-sm ${aiMsg.type === "success" ? "text-green-500" : "text-red-500"}`}>
                                    {aiMsg.text}
                                </p>
                            )}
                            <Button className="w-full" onClick={handleAI} disabled={generating || !aiKey.trim()}>
                                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                                {generating ? "Generating…" : "Generate Problem"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
