"use client";

/** Admin review queue for contributions: approve publishes (problems are re-checked on the compiler first), reject sends a note. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { contributionTitle, type ApplicationPayload, type Contribution, type JobPayload, type ProblemPayload, type QuestionPayload } from "@/lib/contribute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const KINDS = ["all", "problem", "question", "application", "job"] as const;

function Details({ c }: { c: Contribution }) {
  if (c.kind === "problem") {
    const p = c.payload as ProblemPayload;
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">{p.difficulty} · {p.category}</p>
        <p className="whitespace-pre-wrap">{p.description}</p>
        <pre className="rounded bg-muted p-2 text-xs overflow-x-auto">{p.solution}</pre>
        <ul className="text-xs font-mono space-y-1">
          {(c.check?.cases ?? []).map((k, i) => <li key={i} className="break-all">{k.hidden ? "[hidden] " : ""}{k.input} → {k.output ?? k.error}</li>)}
        </ul>
      </div>
    );
  }
  if (c.kind === "question") {
    const q = c.payload as QuestionPayload;
    return (
      <div className="space-y-1 text-sm">
        <p className="text-muted-foreground">Section: {q.section}</p>
        <ol className="list-[upper-alpha] pl-5">{q.options.map((o, i) => <li key={i} className={i === q.answer ? "font-semibold text-green-600 dark:text-green-400" : undefined}>{o}</li>)}</ol>
        <p className="text-muted-foreground">{q.explanation}</p>
      </div>
    );
  }
  if (c.kind === "job") {
    const j = c.payload as JobPayload;
    return <div className="text-sm space-y-1"><p className="text-muted-foreground">{j.company} · {j.location}{j.remote ? " · Remote" : ""}</p><p className="whitespace-pre-wrap">{j.description}</p><p className="break-all text-xs">{j.url}</p></div>;
  }
  const a = c.payload as ApplicationPayload;
  return <div className="text-sm space-y-1"><p className="whitespace-pre-wrap">{a.experience}</p>{a.link && <a className="underline break-all" href={a.link} target="_blank" rel="noopener noreferrer nofollow">{a.link}</a>}</div>;
}

export default function ReviewQueuePage() {
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [items, setItems] = useState<Contribution[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<{ items: Contribution[] }>(`/api/v1/admin/contributions${kind === "all" ? "" : `?kind=${kind}`}`)
      .then((d) => setItems(d.items))
      .catch((e: unknown) => setError(getErrorMessage(e, "Could not load the queue (admins only).")));
  }, [kind]);
  useEffect(load, [load]);

  const review = async (id: string, verdict: "approve" | "reject") => {
    setBusy(id);
    setError(null);
    try {
      await apiRequest(`/api/v1/admin/contributions/${id}/${verdict}`, { method: "POST", body: { note: notes[id] ?? "" } });
      setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      setError(getErrorMessage(e, "Review failed."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
          <h1 className="text-2xl font-bold">Review queue</h1>
        </div>
        <div className="flex gap-1">
          {KINDS.map((k) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)} className="capitalize">{k}</Button>)}
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!items ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        : items.length === 0 ? <p className="text-muted-foreground">Nothing waiting for review.</p>
        : items.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base"><span className="text-muted-foreground capitalize mr-2">{c.kind}</span>{contributionTitle(c)}</CardTitle>
              <p className="text-xs text-muted-foreground">by {c.authorId} · {new Date(c.updatedAt).toLocaleString()}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Details c={c} />
              <Textarea aria-label="Review note" placeholder="Note to the author (required to reject)" rows={2} value={notes[c.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void review(c.id, "approve")} disabled={busy !== null}>{busy === c.id && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Approve</Button>
                <Button size="sm" variant="outline" onClick={() => void review(c.id, "reject")} disabled={busy !== null || !(notes[c.id] ?? "").trim()}>Reject</Button>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
