"use client";

/** Spaced review: one due question at a time; a right answer moves it up a box, a miss sends it back to the start. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { PublicQuestion } from "@/lib/learningPaths";
import { QuizQuestion } from "@/components/QuizQuestion";
import { Button } from "@/components/ui/button";

interface Queue {
  due: (PublicQuestion & { section: string; box: number })[];
  open: number;
}

interface Answered {
  correct: boolean;
  answer: number;
  explanation: string;
  graduated: boolean;
  next: { box: number; due: string } | null;
}

export default function ReviewPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<Queue>("/api/v1/certification/review").then(setQueue).catch((e: unknown) => setError(getErrorMessage(e, "Could not load your review queue.")));
  }, []);
  useEffect(() => {
    if (isSignedIn) load();
  }, [isSignedIn, load]);

  if (isLoaded && !isSignedIn) {
    return <div className="container py-16 text-center space-y-3"><p>Sign in to review.</p><SignInButton mode="modal"><Button>Sign in</Button></SignInButton></div>;
  }
  if (!queue) return <div className="container py-16 flex justify-center">{error ? <p className="text-red-500">{error}</p> : <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}</div>;

  const current = queue.due[0];
  const submit = async () => {
    if (!current || chosen === undefined) return;
    try {
      setAnswered(await apiRequest<Answered>(`/api/v1/certification/review/${current.id}`, { method: "POST", body: { answer: chosen } }));
    } catch (e) {
      setError(getErrorMessage(e, "Could not check your answer."));
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/certification" className="text-sm text-muted-foreground hover:underline">← Certification</Link>
        <span className="text-sm text-muted-foreground">{queue.due.length} due · {queue.open} in review</span>
      </div>
      {!current ? (
        <div className="text-center py-12 space-y-3">
          <CheckCircle2 className="w-10 h-10 mx-auto text-green-500" />
          <p className="font-medium">Nothing due right now.</p>
          <Link href="/certification/mock"><Button variant="outline">Take a mock</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          <QuizQuestion
            question={current}
            chosen={chosen}
            onChoose={setChosen}
            graded={answered ? { id: current.id, correct: answered.correct, chosen: chosen ?? null, answer: answered.answer, explanation: answered.explanation } : undefined}
          />
          {answered ? (
            <div className="flex items-center gap-3">
              <p className="text-sm">
                {answered.graduated ? "Learned. It leaves your review queue." : answered.correct ? `Correct. Next review ${answered.next ? new Date(answered.next.due).toLocaleDateString() : "soon"}.` : "Not quite. It comes back later today."}
              </p>
              <Button size="sm" onClick={() => { setChosen(undefined); setAnswered(null); load(); }}>Next</Button>
            </div>
          ) : (
            <Button onClick={() => void submit()} disabled={chosen === undefined}>Check</Button>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
