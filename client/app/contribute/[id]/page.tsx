"use client";

/**
 * One contribution: edit it, run the automatic check (problems), submit it
 * for review, withdraw it, or delete a draft. The check table shows exactly
 * what the published problem will expect.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { draftFingerprint } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { STATUS_STYLE, type Contribution, type ProblemPayload, type QuestionPayload } from "@/lib/contribute";
import { ProblemForm, QuestionForm } from "@/components/ContributionForms";
import { useExamSections } from "@/components/useExamSections";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContributionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sections = useExamSections();
  const [item, setItem] = useState<Contribution | null | undefined>(undefined);
  const [draft, setDraft] = useState<ProblemPayload | QuestionPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<Contribution>(`/api/v1/contributions/${encodeURIComponent(id)}`)
      .then((c) => { setItem(c); setDraft(c.payload as ProblemPayload | QuestionPayload); })
      .catch(() => setItem(null));
  }, [id]);
  useEffect(load, [load]);

  const act = async (name: string, run: () => Promise<Contribution | null>) => {
    setBusy(name);
    setError(null);
    try {
      const next = await run();
      if (next) { setItem(next); setDraft(next.payload as ProblemPayload | QuestionPayload); }
    } catch (e) {
      setError(getErrorMessage(e, "That didn't work."));
    } finally {
      setBusy(null);
    }
  };

  if (item === undefined) return <div className="container py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (item === null || !draft) return <div className="container py-16 text-center text-muted-foreground">Not found. <Link href="/contribute" className="underline">Back</Link></div>;

  const editable = item.status === "draft" || item.status === "rejected";
  const dirty = JSON.stringify(draft) !== JSON.stringify(item.payload);
  const isProblem = item.kind === "problem";
  const problem = draft as ProblemPayload;
  const checkCurrent = isProblem && item.check?.fingerprint === draftFingerprint(problem.solution, problem.cases);
  const canSubmit = editable && !dirty && (!isProblem || (checkCurrent && item.check?.ok));

  const save = () => act("save", () => {
    const payload = isProblem ? draft : { ...(draft as QuestionPayload), options: (draft as QuestionPayload).options.map((o) => o.trim()).filter(Boolean) };
    return apiRequest<Contribution>(`/api/v1/contributions/${item.id}`, { method: "PUT", body: { payload } });
  });
  const post = (path: string) => () => act(path, () => apiRequest<Contribution>(`/api/v1/contributions/${item.id}/${path}`, { method: "POST" }));
  const remove = () => act("delete", async () => {
    await apiRequest(`/api/v1/contributions/${item.id}`, { method: "DELETE" });
    router.push("/contribute");
    return null;
  });

  return (
    <div className="container max-w-3xl mx-auto py-10 px-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/contribute" className="text-sm text-muted-foreground hover:underline">← Contribute</Link>
        <span className={`rounded px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[item.status]}`}>{item.status}</span>
      </div>

      {item.reviewNote && (
        <Card className={item.status === "rejected" ? "border-red-500/40" : "border-green-500/40"}>
          <CardContent className="py-3 text-sm"><strong>Reviewer:</strong> {item.reviewNote}</CardContent>
        </Card>
      )}
      {item.status === "approved" && item.publishedRef && isProblem && (
        <p className="text-sm">Published: <Link className="underline" href={`/problems/${item.publishedRef}`}>view the problem</Link></p>
      )}

      {isProblem
        ? <ProblemForm value={problem} onChange={setDraft} disabled={!editable || busy !== null} />
        : <QuestionForm value={draft as QuestionPayload} onChange={setDraft} sections={sections} disabled={!editable || busy !== null} />}

      {isProblem && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Automatic check</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!item.check ? <p className="text-muted-foreground">Not run yet. Save your draft, then run the check.</p> : (
              <>
                <p className={item.check.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}>
                  {item.check.ok ? "Your solution ran on every input." : "The check failed: fix the solution or inputs, then run it again. Every input must run, and they must not all give the same output."}
                  {!checkCurrent && " The draft changed since this check, so run it again."}
                </p>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">Input</th><th>Expected output (from the compiler)</th><th /></tr></thead>
                  <tbody>
                    {item.check.cases.map((c, i) => (
                      <tr key={i} className="border-t align-top">
                        <td className="py-1 pr-2 font-mono whitespace-pre-wrap break-all">{c.input}{c.hidden && <span className="ml-1 text-muted-foreground">(hidden)</span>}</td>
                        <td className="py-1 pr-2 font-mono whitespace-pre-wrap break-all">{c.output ?? c.error}</td>
                        <td>{c.output !== undefined ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {editable && (
              <Button size="sm" variant="outline" onClick={() => void post("check")()} disabled={dirty || busy !== null}>
                {busy === "check" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />} Run check
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {editable && <Button variant="outline" onClick={() => void save()} disabled={!dirty || busy !== null}>Save</Button>}
        {editable && <Button onClick={() => void post("submit")()} disabled={!canSubmit || busy !== null}>Submit for review</Button>}
        {item.status === "submitted" && <Button variant="outline" onClick={() => void post("withdraw")()} disabled={busy !== null}>Withdraw</Button>}
        {item.status === "draft" && <Button variant="ghost" className="text-red-500" onClick={() => void remove()} disabled={busy !== null}>Delete draft</Button>}
      </div>
    </div>
  );
}
