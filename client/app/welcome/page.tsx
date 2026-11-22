"use client";

/**
 * Onboarding: who you are, where you are, what you want and how much time you
 * have — then an optional placement check that suggests your level. Saving
 * picks a roadmap and the weekly plan follows the hours chosen.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { Compass, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { label, type Answers, type GradedQuestion, type LearnerMe, type PublicQuestion } from "@/lib/learningPaths";
import { QuizQuestion } from "@/components/QuizQuestion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Field = "role" | "level" | "goal" | "hours";
const QUESTIONS: { field: Field; title: string; options: keyof LearnerMe["options"] }[] = [
  { field: "role", title: "What describes you best?", options: "roles" },
  { field: "level", title: "How well do you know DataWeave?", options: "levels" },
  { field: "goal", title: "What's your goal?", options: "goals" },
  { field: "hours", title: "How much time can you practise?", options: "hours" },
];

interface PlacementResult {
  level: string;
  correct: number;
  total: number;
  results: GradedQuestion[];
}

export default function WelcomePage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<LearnerMe | null>(null);
  const [form, setForm] = useState<Partial<Record<Field, string>>>({});
  const [quiz, setQuiz] = useState<PublicQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [placement, setPlacement] = useState<PlacementResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    apiRequest<LearnerMe>("/api/v1/learning/me")
      .then((d) => {
        setMe(d);
        if (d.onboarding) setForm(d.onboarding);
      })
      .catch((e: unknown) => setError(getErrorMessage(e, "Could not load your learning profile.")));
  }, [isSignedIn]);

  const startPlacement = async () => {
    setError(null);
    try {
      setQuiz((await apiRequest<{ questions: PublicQuestion[] }>("/api/v1/learning/placement")).questions);
    } catch (e) {
      setError(getErrorMessage(e, "Could not load the placement check."));
    }
  };

  const gradePlacement = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<PlacementResult>("/api/v1/learning/placement", { method: "POST", body: { answers } });
      setPlacement(result);
      setForm((f) => ({ ...f, level: result.level }));
    } catch (e) {
      setError(getErrorMessage(e, "Could not grade the placement check."));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await apiRequest<LearnerMe>("/api/v1/learning/onboarding", { method: "PUT", body: form });
      router.push(saved.roadmapId ? `/roadmap/${saved.roadmapId}` : "/roadmap");
    } catch (e) {
      setError(getErrorMessage(e, "Could not save your answers."));
      setBusy(false);
    }
  };

  if (isLoaded && !isSignedIn) {
    return (
      <div className="container max-w-xl mx-auto py-16 text-center space-y-4">
        <Compass className="w-10 h-10 mx-auto text-primary" />
        <h1 className="text-2xl font-bold">Set up your learning path</h1>
        <p className="text-muted-foreground">Sign in to get a roadmap and a weekly plan that fits your time.</p>
        <SignInButton mode="modal"><Button>Sign in</Button></SignInButton>
        <p className="text-sm"><Link href="/roadmap" className="underline">Browse the roadmaps</Link></p>
      </div>
    );
  }

  const complete = QUESTIONS.every((q) => form[q.field]);
  const answeredAll = quiz?.every((q) => answers[q.id] !== undefined) ?? false;

  return (
    <div className="container max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome to DWCode</h1>
        <p className="text-muted-foreground">Four quick questions, and we&apos;ll build your path.</p>
      </div>
      {!me && !error && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
      {me && QUESTIONS.map((q) => (
        <Card key={q.field}>
          <CardHeader className="pb-3"><CardTitle className="text-base">{q.title}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {me.options[q.options].map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={form[q.field] === value ? "default" : "outline"}
                aria-pressed={form[q.field] === value}
                onClick={() => setForm((f) => ({ ...f, [q.field]: value }))}
              >
                {label(value)}
              </Button>
            ))}
            {q.field === "level" && !quiz && (
              <Button type="button" size="sm" variant="ghost" onClick={() => void startPlacement()}>Not sure? Take a 9-question check</Button>
            )}
          </CardContent>
        </Card>
      ))}

      {quiz && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Placement check</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {quiz.map((q, i) => (
              <QuizQuestion
                key={q.id}
                question={q}
                index={i}
                chosen={answers[q.id]}
                onChoose={(o) => setAnswers((a) => ({ ...a, [q.id]: o }))}
                graded={placement?.results.find((r) => r.id === q.id)}
              />
            ))}
            {placement ? (
              <p className={cn("text-sm font-medium")}>
                {placement.correct}/{placement.total} correct. Suggested level: <strong>{label(placement.level)}</strong> (selected above).
              </p>
            ) : (
              <Button onClick={() => void gradePlacement()} disabled={!answeredAll || busy}>Check my answers</Button>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {me && (
        <Button size="lg" onClick={() => void save()} disabled={!complete || busy}>
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Build my path
        </Button>
      )}
    </div>
  );
}
