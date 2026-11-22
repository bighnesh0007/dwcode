"use client";

/**
 * Interview mode: a random, timed set of problems. Solve them in the normal
 * workspace; the scorecard counts only Accepted submissions inside the window.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { CheckCircle2, Circle, CircleDot, Clock, Loader2, Timer } from "lucide-react";
import { INTERVIEW_PRESETS, difficultyClassName, type ProblemOutcome } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Interview {
  id: string;
  preset: string;
  problems: { slug: string; title: string; difficulty: string; category: string }[];
  startedAt: string;
  endsAt: string;
  finishedAt: string | null;
  outcomes: Record<string, ProblemOutcome>;
  solved: number;
  verdict: string | null;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const ICON = {
  solved: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  attempted: <CircleDot className="w-4 h-4 text-yellow-500" />,
  untouched: <Circle className="w-4 h-4 text-muted-foreground" />,
};

export default function InterviewPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [interview, setInterview] = useState<Interview | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<{ interview: Interview | null }>("/api/v1/interview/current")
      .then((d) => setInterview(d.interview))
      .catch(() => setInterview(null));
  }, []);

  useEffect(() => {
    if (isSignedIn) load();
  }, [isSignedIn, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    // Outcomes come from real submissions: refresh them while the tab is open.
    const r = setInterval(() => { if (document.visibilityState === "visible" && isSignedIn) load(); }, 20_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [isSignedIn, load]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      setInterview(await apiRequest<Interview>(path, { method: "POST", ...(body ? { body } : {}) }));
    } catch (e) {
      setError(getErrorMessage(e, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  };

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return (
      <div className="container max-w-screen-md mx-auto py-16 px-4 text-center space-y-4">
        <h1 className="text-3xl font-bold">Interview mode</h1>
        <p className="text-muted-foreground">A timed set of problems with a scorecard, like a technical screen.</p>
        <SignInButton mode="modal"><Button>Sign in to start</Button></SignInButton>
      </div>
    );
  }

  const running = interview && !interview.verdict;
  const remaining = interview ? Date.parse(interview.endsAt) - now : 0;

  return (
    <div className="container max-w-screen-md mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><Timer className="w-7 h-7 text-primary" /> Interview mode</h1>
        <p className="text-muted-foreground mt-1">
          A random set of problems against the clock. Solve them in the normal workspace; only Accepted submissions made during the interview count.
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {interview === undefined ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : running ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">In progress · {interview.solved}/{interview.problems.length} solved</CardTitle>
            <span className={`flex items-center gap-1 font-mono text-lg ${remaining < 5 * 60_000 ? "text-red-500" : ""}`}>
              <Clock className="w-4 h-4" /> {clock(remaining)}
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-2">
              {interview.problems.map((p, i) => (
                <li key={p.slug} className="flex items-center gap-3 rounded-lg border p-3">
                  {ICON[interview.outcomes[p.slug]?.status ?? "untouched"]}
                  <Link href={`/problems/${p.slug}`} target="_blank" className="flex-1 font-medium hover:text-primary">
                    {i + 1}. {p.title}
                  </Link>
                  <span className={`text-xs ${difficultyClassName(p.difficulty).text}`}>{p.difficulty}</span>
                </li>
              ))}
            </ol>
            <Button variant="outline" onClick={() => void act("/api/v1/interview/finish")} disabled={busy}>Finish and score</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {interview?.verdict && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Scorecard</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-lg font-semibold">{interview.solved}/{interview.problems.length} solved</p>
                <p className="text-muted-foreground">{interview.verdict}</p>
                <ul className="space-y-1 text-sm">
                  {interview.problems.map((p) => {
                    const o = interview.outcomes[p.slug];
                    return (
                      <li key={p.slug} className="flex items-center gap-2">
                        {ICON[o?.status ?? "untouched"]}
                        <Link href={`/problems/${p.slug}`} className="hover:text-primary">{p.title}</Link>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {o?.status === "solved" ? `in ${o.solvedAfterMinutes} min` : o?.attempts ? `${o.attempts} attempt${o.attempts > 1 ? "s" : ""}` : "not attempted"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {INTERVIEW_PRESETS.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4 space-y-2">
                  <p className="font-semibold">{p.label}</p>
                  <p className="text-sm text-muted-foreground">{p.problems} problems · {p.minutes} minutes</p>
                  <Button size="sm" className="w-full" onClick={() => void act("/api/v1/interview/start", { preset: p.id })} disabled={busy}>
                    Start
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
