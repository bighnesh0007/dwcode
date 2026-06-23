"use client";

import { CheckCircle2, FlaskConical, Plus, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PlaygroundTestCase } from "../types";

type TestRunnerProps = {
  testCases: PlaygroundTestCase[];
  isRunning: boolean;
  onAddTest: () => void;
  onRemoveTest: (id: string) => void;
  onRenameTest: (id: string, name: string) => void;
  onExpectedOutputChange: (id: string, expectedOutput: string) => void;
  onRunAll: () => void;
};

export function TestRunner({
  testCases,
  isRunning,
  onAddTest,
  onRemoveTest,
  onRenameTest,
  onExpectedOutputChange,
  onRunAll,
}: TestRunnerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <FlaskConical className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tests
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6"
          onClick={onAddTest}
          title="Add test"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          onClick={onRunAll}
          disabled={isRunning || testCases.length === 0}
        >
          Run All
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {testCases.map((testCase) => (
          <div key={testCase.id} className="rounded-md border bg-background p-2">
            <div className="flex items-center gap-2">
              <Input
                value={testCase.name}
                onChange={(event) => onRenameTest(testCase.id, event.target.value)}
                className="h-7 text-xs"
              />
              {testCase.result?.status === "success" && (
                <Badge className="border-green-500/30 bg-green-500/15 text-green-500 hover:bg-green-500/15">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Passed
                </Badge>
              )}
              {testCase.result?.status === "error" && (
                <Badge className="border-red-500/30 bg-red-500/15 text-red-500 hover:bg-red-500/15">
                  <XCircle className="mr-1 h-3 w-3" />
                  Failed
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onRemoveTest(testCase.id)}
                title="Remove test"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              value={testCase.expectedOutput ?? ""}
              onChange={(event) =>
                onExpectedOutputChange(testCase.id, event.target.value)
              }
              placeholder="Expected output"
              className="mt-2 min-h-16 resize-none font-mono text-xs"
            />
            {testCase.result && (
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-xs">
                {testCase.result.output}
              </pre>
            )}
          </div>
        ))}
        {testCases.length === 0 && (
          <p className="py-4 text-center text-xs italic text-muted-foreground">
            No tests yet.
          </p>
        )}
      </div>
    </div>
  );
}
