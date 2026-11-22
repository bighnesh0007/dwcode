"use client";

/** "Explain this error": a plain-English explanation of a compiler error, from the AI tutor. */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";

export function ExplainError({ code, error }: { code: string; error: string }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; text?: string }>({ status: "idle" });

  const run = async () => {
    setState({ status: "loading" });
    try {
      const { explanation } = await apiRequest<{ explanation: string }>("/api/v1/explain", { method: "POST", body: { code, error } });
      setState({ status: "done", text: explanation });
    } catch (e) {
      const text = e instanceof ApiError && e.code === "NOT_CONFIGURED"
        ? "AI explanations are not enabled on this server."
        : e instanceof ApiError && e.status === 401
          ? "Sign in to get an explanation."
          : "Could not explain this error right now.";
      setState({ status: "error", text });
    }
  };

  if (state.status === "idle" || state.status === "loading") {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => void run()} disabled={state.status === "loading"}>
        <Sparkles className="w-3.5 h-3.5" /> {state.status === "loading" ? "Thinking…" : "Explain this error"}
      </Button>
    );
  }
  return (
    <div className={`rounded-lg border p-3 text-xs whitespace-pre-wrap ${state.status === "error" ? "text-muted-foreground" : "bg-primary/5 border-primary/30"}`}>
      {state.status === "done" && <p className="font-semibold mb-1 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-primary" /> What went wrong</p>}
      {state.text}
    </div>
  );
}
