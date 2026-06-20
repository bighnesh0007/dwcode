"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Check, X, Users, ShieldOff, Loader2 } from "lucide-react";
import Link from "next/link";

const emptyManual = {
  title: "",
  description: "",
  input: "{}",
  output: "{}",
  tags: "",
  difficulty: "Medium",
  category: "Manual",
  starterCode: "%dw 2.0\noutput application/json\n---\n",
  solution: "",
};

export default function AdminPage() {
  const { isSignedIn } = useAuth();
  const [adminCheck, setAdminCheck] = useState<"loading" | "allowed" | "forbidden">("loading");

  useEffect(() => {
    if (!isSignedIn) { setAdminCheck("forbidden"); return; }
    fetch("/api/admin/users")
      .then(r => { setAdminCheck(r.status === 403 ? "forbidden" : "allowed"); })
      .catch(() => setAdminCheck("forbidden"));
  }, [isSignedIn]);

  if (adminCheck === "loading") {
    return (
      <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Checking access…
      </div>
    );
  }

  if (adminCheck === "forbidden") {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
        <ShieldOff className="w-10 h-10 opacity-30" />
        <p className="text-lg font-semibold">Access Denied</p>
        <p className="text-sm">Only admins can access this page.</p>
        <Link href="/"><Button variant="outline">Go Home</Button></Link>
      </div>
    );
  }

  return <AdminPageContent />;
}

function AdminPageContent() {
  // AI Generate
  const [isGenerating, setIsGenerating] = useState(false);
  const [difficulty, setDifficulty] = useState("Medium");
  const [category, setCategory] = useState("Arrays");
  const [topic, setTopic] = useState("");
  const [generateMsg, setGenerateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Manual Add
  const [manual, setManual] = useState(emptyManual);
  const [isAdding, setIsAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Manage Problems
  const [problems, setProblems] = useState<any[]>([]);
  const [showManage, setShowManage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchProblems = async () => {
    const res = await fetch("/api/problems");
    const data = await res.json();
    if (Array.isArray(data)) setProblems(data);
  };

  useEffect(() => {
    if (showManage) fetchProblems();
  }, [showManage]);

  // --- AI Generate ---
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateMsg(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty, category, topic }),
      });
      const data = await res.json();
      if (data.success) {
        setGenerateMsg({ type: "success", text: `✓ Generated: "${data.problem?.title}"` });
      } else {
        setGenerateMsg({ type: "error", text: `✗ ${data.error}` });
      }
    } catch (error) {
      setGenerateMsg({ type: "error", text: "✗ Network error. Check your API key." });
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Manual Add ---
  const handleAddManual = async () => {
    if (!manual.title.trim()) return;
    setIsAdding(true);
    setAddMsg(null);
    try {
      const payload = {
        title: manual.title,
        description: manual.description,
        examples: [{ input: manual.input, output: manual.output, explanation: "" }],
        tags: manual.tags.split(",").map(t => t.trim()).filter(Boolean),
        difficulty: manual.difficulty,
        category: manual.category,
        starterCode: manual.starterCode,
        solution: manual.solution,
      };
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setAddMsg({ type: "success", text: `✓ Added: "${manual.title}"` });
        setManual(emptyManual);
        if (showManage) fetchProblems();
      } else {
        setAddMsg({ type: "error", text: `✗ ${data.error}` });
      }
    } catch {
      setAddMsg({ type: "error", text: "✗ Network error." });
    } finally {
      setIsAdding(false);
    }
  };

  // --- Edit ---
  const startEdit = (problem: any) => {
    setEditingId(problem._id);
    setEditData({
      title: problem.title,
      description: problem.description,
      difficulty: problem.difficulty,
      tags: (problem.tags || []).join(", "),
      starterCode: problem.starterCode,
    });
  };

  const saveEdit = async (id: string) => {
    const payload = {
      ...editData,
      tags: editData.tags.split(",").map((t: string) => t.trim()).filter(Boolean),
    };
    const res = await fetch(`/api/problems/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      setEditingId(null);
      fetchProblems();
    }
  };

  // --- Delete ---
  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/problems/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setDeleteConfirm(null);
      fetchProblems();
    }
  };

  return (
    <div className="container max-w-screen-md mx-auto py-10 px-4 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage problems, generate with AI, or create your own.</p>
        </div>
        <Link href="/admin/users">
          <Button variant="outline" size="sm" className="gap-2">
            <Users className="w-4 h-4" /> Manage Users
          </Button>
        </Link>
      </div>

      {/* AI Generate */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center text-lg">
            <Sparkles className="w-5 h-5 mr-2 text-primary" />
            Generate via AI
          </CardTitle>
          <CardDescription>Use Gemini AI to create realistic DataWeave problems.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Difficulty</label>
              <Select value={difficulty} onValueChange={(v) => v && setDifficulty(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Arrays">Arrays</SelectItem>
                  <SelectItem value="Objects">Objects</SelectItem>
                  <SelectItem value="Strings">Strings</SelectItem>
                  <SelectItem value="Transformations">Transformations</SelectItem>
                  <SelectItem value="XML">XML / MIME</SelectItem>
                  <SelectItem value="Core Functions">Core Functions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Topic hint <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input placeholder="e.g., group orders by region using groupBy…" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          {generateMsg && (
            <p className={`text-sm ${generateMsg.type === "success" ? "text-green-500" : "text-red-500"}`}>{generateMsg.text}</p>
          )}
          <Button className="w-full" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Generating…" : "Generate Question"}
          </Button>
        </CardContent>
      </Card>

      {/* Manual Add */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center text-lg">
            <Plus className="w-5 h-5 mr-2 text-primary" />
            Add Question Manually
          </CardTitle>
          <CardDescription>Create your own DataWeave question with full control.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title <span className="text-red-500">*</span></label>
            <Input placeholder="e.g., Filter active users from payload" value={manual.title} onChange={(e) => setManual(m => ({ ...m, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea placeholder="Describe what the DataWeave script should do…" value={manual.description} onChange={(e) => setManual(m => ({ ...m, description: e.target.value }))} rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Example Input</label>
              <Textarea className="font-mono text-xs" placeholder='{"users": [...]}' value={manual.input} onChange={(e) => setManual(m => ({ ...m, input: e.target.value }))} rows={4} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Expected Output</label>
              <Textarea className="font-mono text-xs" placeholder='[{"name": "..."}]' value={manual.output} onChange={(e) => setManual(m => ({ ...m, output: e.target.value }))} rows={4} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Difficulty</label>
              <Select value={manual.difficulty} onValueChange={(v) => v && setManual(m => ({ ...m, difficulty: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tags <span className="text-muted-foreground font-normal">(comma separated)</span></label>
              <Input placeholder="JSON, map, filter" value={manual.tags} onChange={(e) => setManual(m => ({ ...m, tags: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Starter Code</label>
            <Textarea className="font-mono text-sm" value={manual.starterCode} onChange={(e) => setManual(m => ({ ...m, starterCode: e.target.value }))} rows={4} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Solution <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Textarea className="font-mono text-sm" placeholder="Provide a reference solution..." value={manual.solution} onChange={(e) => setManual(m => ({ ...m, solution: e.target.value }))} rows={4} />
          </div>
          {addMsg && (
            <p className={`text-sm ${addMsg.type === "success" ? "text-green-500" : "text-red-500"}`}>{addMsg.text}</p>
          )}
          <Button className="w-full" onClick={handleAddManual} disabled={isAdding || !manual.title.trim()}>
            {isAdding ? "Adding…" : "Add Question"}
          </Button>
        </CardContent>
      </Card>

      {/* Manage Problems */}
      <Card>
        <CardHeader
          className="pb-4 cursor-pointer select-none"
          onClick={() => setShowManage(!showManage)}
        >
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center">
              <Pencil className="w-5 h-5 mr-2 text-primary" />
              Manage Problems
              {problems.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{problems.length}</Badge>}
            </span>
            {showManage ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </CardTitle>
          <CardDescription>Edit or delete existing problems.</CardDescription>
        </CardHeader>
        {showManage && (
          <CardContent className="space-y-3">
            {problems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No problems yet.</p>
            ) : (
              problems.map((p) => (
                <div key={p._id} className="border rounded-lg p-3 space-y-2">
                  {editingId === p._id ? (
                    <div className="space-y-2">
                      <Input value={editData.title} onChange={e => setEditData((d: any) => ({ ...d, title: e.target.value }))} placeholder="Title" />
                      <Textarea value={editData.description} onChange={e => setEditData((d: any) => ({ ...d, description: e.target.value }))} rows={3} placeholder="Description" />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={editData.difficulty} onValueChange={v => v && setEditData((d: any) => ({ ...d, difficulty: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Easy">Easy</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="Hard">Hard</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input value={editData.tags} onChange={e => setEditData((d: any) => ({ ...d, tags: e.target.value }))} placeholder="Tags (comma separated)" />
                      </div>
                      <Textarea className="font-mono text-xs" value={editData.starterCode} onChange={e => setEditData((d: any) => ({ ...d, starterCode: e.target.value }))} rows={3} placeholder="Starter code" />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => saveEdit(p._id)}><Check className="w-3.5 h-3.5 mr-1" /> Save</Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Link href={`/problems/${p.slug}`} className="text-sm font-medium hover:text-primary truncate block">
                          {p.title}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-xs ${p.difficulty === "Easy" ? "text-green-500" : p.difficulty === "Medium" ? "text-yellow-500" : "text-red-500"}`}>
                            {p.difficulty}
                          </span>
                          {(p.tags || []).slice(0, 2).map((t: string) => (
                            <Badge key={t} variant="outline" className="text-[10px] py-0">{t}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {deleteConfirm === p._id ? (
                          <div className="flex gap-1">
                            <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => handleDelete(p._id)}>
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setDeleteConfirm(null)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={() => setDeleteConfirm(p._id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
