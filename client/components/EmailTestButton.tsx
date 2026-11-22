"use client";

/** Admin: send a test email to yourself, to check the mail setup. */
import { useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";

export function EmailTestButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const send = async () => {
    setMsg(null);
    try {
      const r = await apiRequest<{ to: string }>("/api/v1/admin/ops/email-test", { method: "POST" });
      setMsg(`Sent to ${r.to}.`);
    } catch (e) {
      setMsg(getErrorMessage(e, "Sending failed."));
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void send()}>Email test</Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </span>
  );
}
