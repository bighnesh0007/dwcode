"use client";

/** The Debugging Arena: problems that start from a broken script you have to fix. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bug, Loader2 } from "lucide-react";
import { difficultyClassName } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import type { ProblemSummary } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const BUG_LABELS: Record<string, string> = {
  precedence: "Operator precedence",
  "off-by-one": "Off by one",
  "null-handling": "Null handling",
  "type-mismatch": "Type mismatch",
  "type-coercion": "Type coercion",
  reduce: "reduce accumulator",
  syntax: "Syntax",
};

export default function DebuggingPage() {
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);

  useEffect(() => {
    apiRequest<ProblemSummary[]>("/api/v1/problems?category=Debugging").then(setProblems).catch(() => setProblems([]));
  }, []);

  return (
    <div className="container max-w-screen-lg mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Bug className="w-7 h-7 text-primary" /> Debugging Arena
        </h1>
        <p className="text-muted-foreground mt-1">
          Each problem starts from a script that is broken: it throws, or quietly returns the wrong thing. Read the
          error, find the bug, and fix it. Graded on hidden tests like every other problem.
        </p>
      </div>
      {problems === null ? (
        <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : problems.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center">No debugging problems yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {problems.map((p) => {
            const bug = p.tags.find((t) => t !== "debugging");
            return (
              <Link key={p._id} href={`/problems/${p.slug}`}>
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold">{p.title.replace(/^Debug:\s*/, "")}</h2>
                      <span className={`text-xs font-medium ${difficultyClassName(p.difficulty).text}`}>{p.difficulty}</span>
                    </div>
                    {bug && <Badge variant="outline" className="text-[10px]">{BUG_LABELS[bug] ?? bug}</Badge>}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
