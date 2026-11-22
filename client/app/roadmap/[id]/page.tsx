"use client";

/**
 * One roadmap: each step's lesson, the problems to solve and a quiz. A step
 * is complete once its problem target is met and its quiz passed; "This
 * week" highlights the next steps for the hours chosen at onboarding.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { CalendarCheck, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { difficultyClassName, getDifficultyTier } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { label, type Answers, type GradedQuestion, type PublicQuestion } from "@/lib/learningPaths";
import { InlineCode } from "@/components/InlineCode";
import { QuizQuestion } from "@/components/QuizQuestion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Step {
  id: string;
  title: string;
  lesson: string;
  categories: string[];
  solveCount: number;
  solved: number;
  quiz: PublicQuestion[];
  quizPassed: boolean;
  complete: boolean;
  problems: { slug: string; title: string; difficulty: string; solved: boolean }[];
}

interface RoadmapView {
  id: string;
  title: string;
  summary: string;
  steps: Step[];
  completed: number;
  weekly: string[];
  hours: string;
  current: boolean;
}

function StepQuiz({ roadmapId, step, onPassed }: { roadmapId: string; step: Step; onPassed: () => void }) {
  const { isSignedIn } = useAuth();
  const [answers, setAnswers] = useState<Answers>({});
  const [graded, setGraded] = useState<{ passed: boolean; results: GradedQuestion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (step.quiz.length === 0) return null;
  if (step.quizPassed && !graded) return <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Quiz passed</p>;

  const submit = async () => {
    setError(null);
    try {
      const result = await apiRequest<{ passed: boolean; results: GradedQuestion[] }>(
        `/api/v1/learning/roadmaps/${roadmapId}/steps/${step.id}/quiz`,
        { method: "POST", body: { answers } },
      );
      setGraded(result);
      if (result.passed) onPassed();
    } catch (e) {
      setError(getErrorMessage(e, "Could not check your answers."));
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quiz</p>
      {step.quiz.map((q) => (
        <QuizQuestion key={q.id} question={q} chosen={answers[q.id]} onChoose={(o) => setAnswers((a) => ({ ...a, [q.id]: o }))} graded={graded?.results.find((r) => r.id === q.id)} />
      ))}
      {!isSignedIn ? (
        <SignInButton mode="modal"><Button size="sm" variant="outline">Sign in to take the quiz</Button></SignInButton>
      ) : graded ? (
        graded.passed ? <p className="text-sm text-green-600 dark:text-green-400">Passed!</p> : <Button size="sm" variant="outline" onClick={() => { setGraded(null); setAnswers({}); }}>Try again</Button>
      ) : (
        <Button size="sm" onClick={() => void submit()} disabled={step.quiz.some((q) => answers[q.id] === undefined)}>Check</Button>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

export default function RoadmapPage() {
  const { id } = useParams<{ id: string }>();
  const { isSignedIn } = useAuth();
  const [view, setView] = useState<RoadmapView | null | undefined>(undefined);

  const load = useCallback(() => {
    apiRequest<RoadmapView>(`/api/v1/learning/roadmaps/${encodeURIComponent(id)}`).then(setView).catch(() => setView(null));
  }, [id]);
  useEffect(load, [load, isSignedIn]);

  const choose = async () => {
    await apiRequest(`/api/v1/learning/roadmaps/${encodeURIComponent(id)}/choose`, { method: "POST" });
    load();
  };

  if (view === undefined) return <div className="container py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (view === null) return <div className="container py-16 text-center text-muted-foreground">Roadmap not found. <Link href="/roadmap" className="underline">All roadmaps</Link></div>;

  const weekly = new Set(view.weekly);
  return (
    <div className="container max-w-3xl mx-auto py-10 px-4 space-y-6">
      <div className="space-y-2">
        <Link href="/roadmap" className="text-sm text-muted-foreground hover:underline">← Roadmaps</Link>
        <h1 className="text-2xl font-bold">{view.title}</h1>
        <p className="text-muted-foreground">{view.summary}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-2 w-48 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={view.completed} aria-valuemax={view.steps.length} aria-label="Steps complete">
            <div className="h-full bg-primary" style={{ width: `${(view.completed / Math.max(1, view.steps.length)) * 100}%` }} />
          </div>
          <span className="text-sm text-muted-foreground">{view.completed}/{view.steps.length} steps</span>
          {isSignedIn && !view.current && <Button size="sm" variant="outline" onClick={() => void choose()}>Make this my roadmap</Button>}
        </div>
      </div>

      {isSignedIn && view.weekly.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-4 text-sm flex items-start gap-2">
            <CalendarCheck className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <span>
              <strong>This week</strong> ({label(view.hours)}):{" "}
              {view.steps.filter((s) => weekly.has(s.id)).map((s) => s.title).join(", ")}
            </span>
          </CardContent>
        </Card>
      )}

      <ol className="space-y-4">
        {view.steps.map((step, i) => (
          <li key={step.id}>
            <Card className={weekly.has(step.id) ? "border-primary/50" : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {step.complete ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                  <span className="text-muted-foreground">{i + 1}.</span> {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed"><InlineCode text={step.lesson} /></p>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Solve {step.solveCount} in {step.categories.join(" / ")} — {step.solved}/{step.solveCount}
                  </p>
                  <ul className="grid gap-1">
                    {step.problems.map((p) => (
                      <li key={p.slug} className="flex items-center gap-2 text-sm">
                        {p.solved ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground" />}
                        <Link href={`/problems/${p.slug}`} className="hover:underline">{p.title}</Link>
                        <span className={`text-xs ${difficultyClassName(p.difficulty).text}`}>{getDifficultyTier(p.difficulty)?.label ?? p.difficulty}</span>
                      </li>
                    ))}
                    {step.problems.length === 0 && <li className="text-sm text-muted-foreground">No problems in these categories yet.</li>}
                  </ul>
                </div>
                <StepQuiz roadmapId={view.id} step={step} onPassed={load} />
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
