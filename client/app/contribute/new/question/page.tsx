"use client";

/** Start a certification question. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { Contribution, QuestionPayload } from "@/lib/contribute";
import { EMPTY_QUESTION, QuestionForm } from "@/components/ContributionForms";
import { useExamSections } from "@/components/useExamSections";
import { Button } from "@/components/ui/button";

export default function NewQuestionPage() {
  const router = useRouter();
  const sections = useExamSections();
  const [value, setValue] = useState<QuestionPayload>(EMPTY_QUESTION);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...value, options: value.options.map((o) => o.trim()).filter(Boolean) };
      const created = await apiRequest<Contribution>("/api/v1/contributions", { method: "POST", body: { kind: "question", payload } });
      router.push(`/contribute/${created.id}`);
    } catch (e) {
      setError(getErrorMessage(e, "Could not save the question."));
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-2xl font-bold">New certification question</h1>
      <QuestionForm value={value} onChange={setValue} sections={sections} disabled={busy} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={() => void save()} disabled={busy}>Save draft</Button>
    </div>
  );
}
