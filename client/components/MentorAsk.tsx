"use client";

/** Ask a mentor for help; they get a notification linking to your profile. */
import { useState } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { MENTOR_ASKS_PER_DAY } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MentorAsk({ username }: { username: string }) {
  const { isSignedIn } = useAuth();
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!isSignedIn) return <SignInButton mode="modal"><Button size="sm" variant="outline">Sign in to ask for help</Button></SignInButton>;
  if (state === "sent") return <p className="text-sm text-green-600 dark:text-green-400">Sent. They&apos;ll see it in their notifications.</p>;

  const send = async () => {
    setState("sending");
    setError(null);
    try {
      await apiRequest(`/api/v1/mentors/${encodeURIComponent(username)}/ask`, { method: "POST", body: { message } });
      setState("sent");
    } catch (e) {
      setError(getErrorMessage(e, "Could not send your request."));
      setState("idle");
    }
  };

  return (
    <div className="space-y-2">
      <Textarea aria-label={`Message to ${username}`} rows={3} placeholder="What do you need help with?" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void send()} disabled={state === "sending" || message.trim().length < 10}>Ask for mentoring</Button>
        <span className="text-xs text-muted-foreground">Up to {MENTOR_ASKS_PER_DAY} requests a day.</span>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
