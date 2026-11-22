"use client";

/** One multiple-choice question: pick an option, then show the server's grading. */
import { CheckCircle2, XCircle } from "lucide-react";
import { InlineCode } from "@/components/InlineCode";
import type { GradedQuestion, PublicQuestion } from "@/lib/learningPaths";
import { cn } from "@/lib/utils";

interface Props {
  question: PublicQuestion;
  index?: number;
  chosen: number | undefined;
  onChoose: (option: number) => void;
  graded?: GradedQuestion | undefined;
}

export function QuizQuestion({ question, index, chosen, onChoose, graded }: Props) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {index !== undefined && <span className="text-muted-foreground mr-1">{index + 1}.</span>}
        <InlineCode text={question.prompt} />
      </legend>
      <div className="grid gap-2">
        {question.options.map((option, i) => {
          const isAnswer = graded?.answer === i;
          const isWrongPick = graded?.chosen === i && !graded.correct;
          return (
            <button
              key={i}
              type="button"
              disabled={Boolean(graded)}
              aria-pressed={chosen === i}
              onClick={() => onChoose(i)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                chosen === i && !graded && "border-primary bg-primary/10",
                isAnswer && "border-green-500 bg-green-500/10",
                isWrongPick && "border-red-500 bg-red-500/10",
                !graded && "hover:bg-muted",
              )}
            >
              {isAnswer ? <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500" /> : isWrongPick ? <XCircle className="w-4 h-4 shrink-0 text-red-500" /> : <span className="w-4 h-4 shrink-0 rounded-full border" />}
              <InlineCode text={option} />
            </button>
          );
        })}
      </div>
      {graded && <p className="text-xs text-muted-foreground"><InlineCode text={graded.explanation} /></p>}
    </fieldset>
  );
}
