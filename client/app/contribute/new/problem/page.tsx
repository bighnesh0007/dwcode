"use client";

/** Start a problem draft. Saving creates the draft; the automatic check runs from its page. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { Contribution, ProblemPayload } from "@/lib/contribute";
import { EMPTY_PROBLEM, ProblemForm } from "@/components/ContributionForms";
import { Button } from "@/components/ui/button";

export default function NewProblemPage() {
  const router = useRouter();
  const [value, setValue] = useState<ProblemPayload>(EMPTY_PROBLEM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await apiRequest<Contribution>("/api/v1/contributions", { method: "POST", body: { kind: "problem", payload: value } });
      router.push(`/contribute/${created.id}`);
    } catch (e) {
      setError(getErrorMessage(e, "Could not save the draft."));
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-3xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-2xl font-bold">New problem</h1>
      <ProblemForm value={value} onChange={setValue} disabled={busy} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={() => void save()} disabled={busy}>Save draft</Button>
    </div>
  );
}
