"use client";

/** Hints revealed one at a time, so a learner takes only the help they need. */
import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProgressiveHints({ hints }: { hints: readonly string[] }) {
  const [shown, setShown] = useState(0);
  if (hints.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
        <Lightbulb className="w-4 h-4 text-yellow-500" /> Hints
        <span className="text-xs font-normal text-muted-foreground">({shown}/{hints.length})</span>
      </p>
      {shown > 0 && (
        <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground mb-2">
          {hints.slice(0, shown).map((hint, i) => <li key={i}>{hint}</li>)}
        </ol>
      )}
      {shown < hints.length && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShown((n) => n + 1)}>
          {shown === 0 ? "Show a hint" : "Show the next hint"}
        </Button>
      )}
    </div>
  );
}
