"use client";

/** Forms for a problem draft and a certification question. The parent saves; these only edit the payload. */
import { DIFFICULTY_TIERS, DRAFT_CASES } from "@dwcode/shared";
import { Plus, Trash2 } from "lucide-react";
import type { ProblemPayload, QuestionPayload } from "@/lib/contribute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const EMPTY_PROBLEM: ProblemPayload = {
  title: "",
  difficulty: DIFFICULTY_TIERS[0]?.id ?? "",
  category: "Transformations",
  description: "",
  tags: [],
  starterCode: "%dw 2.0\noutput application/json\n---\n",
  solution: "%dw 2.0\noutput application/json\n---\n",
  cases: [{ input: "{}", hidden: false }, { input: "{}", hidden: true }],
  hints: [],
};

export const EMPTY_QUESTION: QuestionPayload = { section: "dataweave", prompt: "", options: ["", "", "", ""], answer: 0, explanation: "" };

const list = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);

export function ProblemForm({ value, onChange, disabled }: { value: ProblemPayload; onChange: (v: ProblemPayload) => void; disabled?: boolean }) {
  const set = <K extends keyof ProblemPayload>(key: K, v: ProblemPayload[K]) => onChange({ ...value, [key]: v });
  const setCase = (i: number, c: Partial<ProblemPayload["cases"][number]>) =>
    set("cases", value.cases.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3 space-y-1"><Label htmlFor="title">Title</Label><Input id="title" value={value.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div className="space-y-1">
          <Label htmlFor="difficulty">Difficulty</Label>
          <select id="difficulty" className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={value.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            {DIFFICULTY_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label htmlFor="category">Category</Label><Input id="category" value={value.category} onChange={(e) => set("category", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="tags">Tags (comma-separated)</Label><Input id="tags" value={value.tags.join(", ")} onChange={(e) => set("tags", list(e.target.value))} /></div>
      </div>
      <div className="space-y-1"><Label htmlFor="description">Description</Label><Textarea id="description" rows={5} value={value.description} onChange={(e) => set("description", e.target.value)} /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="starter">Starter code</Label><Textarea id="starter" rows={6} className="font-mono text-xs" value={value.starterCode} onChange={(e) => set("starterCode", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="solution">Your solution</Label><Textarea id="solution" rows={6} className="font-mono text-xs" value={value.solution} onChange={(e) => set("solution", e.target.value)} /></div>
      </div>
      <div className="space-y-2">
        <Label>Test inputs ({DRAFT_CASES.min}–{DRAFT_CASES.max}; at least one visible)</Label>
        <p className="text-xs text-muted-foreground">Inputs only. The automatic check runs your solution on each one and records the output as the expected answer.</p>
        {value.cases.map((c, i) => (
          <div key={i} className="flex gap-2 items-start">
            <Textarea aria-label={`Input ${i + 1}`} rows={2} className="font-mono text-xs" value={c.input} onChange={(e) => setCase(i, { input: e.target.value })} />
            <label className="flex items-center gap-1 text-xs whitespace-nowrap pt-2">
              <input type="checkbox" checked={c.hidden} onChange={(e) => setCase(i, { hidden: e.target.checked })} /> Hidden
            </label>
            <Button type="button" size="icon" variant="ghost" aria-label={`Remove input ${i + 1}`} disabled={value.cases.length <= DRAFT_CASES.min} onClick={() => set("cases", value.cases.filter((_, j) => j !== i))}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={value.cases.length >= DRAFT_CASES.max} onClick={() => set("cases", [...value.cases, { input: "{}", hidden: false }])}>
          <Plus className="w-4 h-4 mr-1" /> Add input
        </Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="hints">Hints (one per line, up to 5)</Label>
        <Textarea id="hints" rows={3} value={value.hints.join("\n")} onChange={(e) => set("hints", e.target.value.split("\n").map((h) => h.trim()).filter(Boolean).slice(0, 5))} />
      </div>
    </fieldset>
  );
}

export function QuestionForm({ value, onChange, sections, disabled }: {
  value: QuestionPayload;
  onChange: (v: QuestionPayload) => void;
  sections: { id: string; title: string }[];
  disabled?: boolean;
}) {
  const set = <K extends keyof QuestionPayload>(key: K, v: QuestionPayload[K]) => onChange({ ...value, [key]: v });
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="section">Exam section</Label>
        <select id="section" className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={value.section} onChange={(e) => set("section", e.target.value)}>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>
      <div className="space-y-1"><Label htmlFor="prompt">Question (use `backticks` for code)</Label><Textarea id="prompt" rows={3} value={value.prompt} onChange={(e) => set("prompt", e.target.value)} /></div>
      <div className="space-y-2">
        <Label>Options: select the correct one</Label>
        {value.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name="answer" aria-label={`Option ${i + 1} is correct`} checked={value.answer === i} onChange={() => set("answer", i)} />
            <Input aria-label={`Option ${i + 1}`} value={o} onChange={(e) => set("options", value.options.map((x, j) => (j === i ? e.target.value : x)))} />
          </div>
        ))}
      </div>
      <div className="space-y-1"><Label htmlFor="explanation">Why that answer is right</Label><Textarea id="explanation" rows={3} value={value.explanation} onChange={(e) => set("explanation", e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">Write your own question. Never copy one from a real exam or exam dump.</p>
    </fieldset>
  );
}
