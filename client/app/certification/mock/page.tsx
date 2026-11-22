"use client";

/**
 * A timed mock exam. Questions come without answers; the server re-derives
 * the set from its seed and grades it, then queues misses for review. When
 * time runs out the answers given so far are submitted.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { Loader2, Timer } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { Answers, GradedQuestion, PublicQuestion } from "@/lib/learningPaths";
import { QuizQuestion } from "@/components/QuizQuestion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Mock {
  seed: number;
  minutes: number;
  passPercent: number;
  questions: (PublicQuestion & { section: string })[];
}

interface Graded {
  score: number;
  passed: boolean;
  results: (GradedQuestion & { section: string })[];
}

export default function MockPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [mock, setMock] = useState<Mock | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [graded, setGraded] = useState<Graded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept in step from event handlers, so the timer can submit the latest answers.
  const answersRef = useRef<Answers>({});
  const choose = (id: string, option: number) => {
    answersRef.current = { ...answersRef.current, [id]: option };
    setAnswers(answersRef.current);
  };

  const start = async () => {
    setError(null);
    setGraded(null);
    setAnswers({});
    answersRef.current = {};
    try {
      const m = await apiRequest<Mock>("/api/v1/certification/mock", { method: "POST" });
      setMock(m);
      setEndsAt(Date.now() + m.minutes * 60_000);
    } catch (e) {
      setError(getErrorMessage(e, "Could not start a mock."));
    }
  };

  const submit = useCallback(async () => {
    if (!mock) return;
    setBusy(true);
    try {
      setGraded(await apiRequest<Graded>("/api/v1/certification/mock/grade", { method: "POST", body: { seed: mock.seed, answers: answersRef.current } }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(getErrorMessage(e, "Could not grade the mock."));
    } finally {
      setBusy(false);
    }
  }, [mock]);

  useEffect(() => {
    if (!mock || graded) return;
    const t = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at >= endsAt) {
        clearInterval(t);
        void submit();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [mock, graded, endsAt, submit]);

  const left = Math.max(0, endsAt - now);

  if (isLoaded && !isSignedIn) {
    return <div className="container py-16 text-center space-y-3"><p>Sign in to take a mock exam.</p><SignInButton mode="modal"><Button>Sign in</Button></SignInButton></div>;
  }

  if (!mock) {
    return (
      <div className="container max-w-xl mx-auto py-16 text-center space-y-4">
        <Timer className="w-10 h-10 mx-auto text-primary" />
        <h1 className="text-2xl font-bold">Mock exam</h1>
        <p className="text-muted-foreground">The clock starts when you press start. You can leave questions blank.</p>
        <Button onClick={() => void start()}>Start</Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <div className="container max-w-3xl mx-auto py-10 px-4 space-y-6">
      <div className="sticky top-14 z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b flex items-center justify-between">
        <Link href="/certification" className="text-sm text-muted-foreground hover:underline">← Certification</Link>
        {graded ? (
          <span className={`font-semibold ${graded.passed ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{graded.score}% — {graded.passed ? "pass" : `below the ${mock.passPercent}% pass mark`}</span>
        ) : (
          <span className="font-mono text-sm flex items-center gap-1" aria-live="polite"><Timer className="w-4 h-4" /> {minutes}:{String(seconds).padStart(2, "0")}</span>
        )}
      </div>

      {graded && (
        <Card><CardContent className="py-4 text-sm flex flex-wrap items-center justify-between gap-3">
          <span>Questions you missed are now in your spaced review queue.</span>
          <span className="flex gap-2">
            <Link href="/certification/review"><Button size="sm" variant="outline">Review</Button></Link>
            <Button size="sm" onClick={() => void start()}>New mock</Button>
          </span>
        </CardContent></Card>
      )}

      {mock.questions.map((q, i) => (
        <QuizQuestion key={q.id} index={i} question={q} chosen={answers[q.id]} onChoose={(o) => choose(q.id, o)} graded={graded?.results.find((r) => r.id === q.id)} />
      ))}

      {!graded && (
        <Button onClick={() => void submit()} disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Submit ({Object.keys(answers).length}/{mock.questions.length} answered)
        </Button>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
