"use client";

/** Apply to become a contributor: a short note about your experience, reviewed by an admin. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { Contribution } from "@/lib/contribute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ApplyPage() {
  const router = useRouter();
  const [experience, setExperience] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { experience, ...(link.trim() ? { link: link.trim() } : {}) };
      const created = await apiRequest<Contribution>("/api/v1/contributions", { method: "POST", body: { kind: "application", payload } });
      await apiRequest(`/api/v1/contributions/${created.id}/submit`, { method: "POST" });
      router.push("/contribute");
    } catch (e) {
      setError(getErrorMessage(e, "Could not send your application."));
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-xl mx-auto py-10 px-4 space-y-5">
      <h1 className="text-2xl font-bold">Become a contributor</h1>
      <div className="space-y-1">
        <Label htmlFor="experience">Your DataWeave or MuleSoft experience</Label>
        <Textarea id="experience" rows={5} value={experience} onChange={(e) => setExperience(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="link">A link to your work (optional)</Label>
        <Input id="link" type="url" placeholder="https://github.com/…" value={link} onChange={(e) => setLink(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={() => void send()} disabled={busy || experience.trim().length < 20}>Send application</Button>
    </div>
  );
}
