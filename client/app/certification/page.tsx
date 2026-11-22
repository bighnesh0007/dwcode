"use client";

/**
 * MuleSoft Certified Developer – Level 1 prep: the exam outline, a readiness
 * meter from recent mock scores and open review items, and entry points to a
 * timed mock and to spaced review.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { GraduationCap, RotateCcw, Timer } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Exam {
  title: string;
  passPercent: number;
  mockQuestions: number;
  mockMinutes: number;
  note: string;
  bank: number;
  sections: { id: string; title: string; weight: number; questions: number }[];
}

interface Readiness {
  readiness: number;
  passPercent: number;
  mocks: { at: string; score: number }[];
  openReview: number;
  due: number;
  sections: Record<string, { correct: number; total: number }>;
}

export default function CertificationPage() {
  const { isSignedIn } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  const [ready, setReady] = useState<Readiness | null>(null);

  useEffect(() => {
    apiRequest<Exam>("/api/v1/certification").then(setExam).catch(() => {});
  }, []);
  useEffect(() => {
    if (isSignedIn) apiRequest<Readiness>("/api/v1/certification/readiness").then(setReady).catch(() => {});
  }, [isSignedIn]);

  const meter = ready?.readiness ?? 0;
  const tone = meter >= (exam?.passPercent ?? 70) ? "bg-green-500" : meter >= 50 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><GraduationCap className="w-6 h-6 text-primary" /> {exam?.title ?? "Certification prep"}</h1>
        {exam && <p className="text-sm text-muted-foreground mt-1">{exam.note}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base">Readiness</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {isSignedIn ? (
              <>
                <p className="text-4xl font-bold">{meter}<span className="text-lg text-muted-foreground">%</span></p>
                <div className="h-2 rounded-full bg-muted overflow-hidden" role="meter" aria-valuenow={meter} aria-valuemin={0} aria-valuemax={100} aria-label="Readiness">
                  <div className={`h-full ${tone}`} style={{ width: `${meter}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {ready && ready.mocks.length > 0
                    ? `From your last ${Math.min(5, ready.mocks.length)} mock${ready.mocks.length === 1 ? "" : "s"}, less 2 points per open review item. Aim for ${exam?.passPercent ?? 70}%+.`
                    : "Take a mock exam to get a readiness score."}
                </p>
              </>
            ) : (
              <SignInButton mode="modal"><Button size="sm" variant="outline">Sign in to track readiness</Button></SignInButton>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Timer className="w-4 h-4" /> Mock exam</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{exam?.mockQuestions ?? 20} questions in {exam?.mockMinutes ?? 40} minutes, weighted like the real exam. Pass mark {exam?.passPercent ?? 70}%.</p>
            <Link href="/certification/mock"><Button size="sm">Start a mock</Button></Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Spaced review</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Questions you miss come back after 0, 1, 3, 7 and 14 days until you&apos;ve got them.
              {ready && <> <strong>{ready.due}</strong> due now, {ready.openReview} in review.</>}
            </p>
            <Link href="/certification/review"><Button size="sm" variant="outline" disabled={ready?.due === 0}>Review now</Button></Link>
          </CardContent>
        </Card>
      </div>

      {exam && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Exam sections</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Section</th><th className="font-medium">Weight</th><th className="font-medium">Your accuracy</th></tr></thead>
              <tbody>
                {exam.sections.map((s) => {
                  const mine = ready?.sections[s.id];
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="py-1.5">{s.title}</td>
                      <td>{s.weight}%</td>
                      <td>{mine && mine.total > 0 ? `${Math.round((mine.correct / mine.total) * 100)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">{exam.bank} questions in the bank. Weights are approximate.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
