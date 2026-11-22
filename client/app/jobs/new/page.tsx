"use client";

/** Post a job: it goes to the admin review queue and is listed once approved. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewJobPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [job, setJob] = useState({ title: "", company: "", location: "", remote: false, url: "", description: "", tags: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoaded && !isSignedIn) return <div className="container py-16 text-center"><SignInButton mode="modal"><Button>Sign in to post a job</Button></SignInButton></div>;

  const set = (k: keyof typeof job, v: string | boolean) => setJob((j) => ({ ...j, [k]: v }));
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...job, tags: job.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8) };
      const created = await apiRequest<{ id: string }>("/api/v1/contributions", { method: "POST", body: { kind: "job", payload } });
      await apiRequest(`/api/v1/contributions/${created.id}/submit`, { method: "POST" });
      router.push("/contribute");
    } catch (e) {
      setError(getErrorMessage(e, "Could not post the job."));
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-10 px-4 space-y-4">
      <h1 className="text-2xl font-bold">Post a job</h1>
      <p className="text-sm text-muted-foreground">An admin reviews every post before it&apos;s listed.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="title">Role</Label><Input id="title" value={job.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="company">Company</Label><Input id="company" value={job.company} onChange={(e) => set("company", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="location">Location</Label><Input id="location" value={job.location} onChange={(e) => set("location", e.target.value)} /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="url">Link to apply</Label><Input id="url" type="url" placeholder="https://…" value={job.url} onChange={(e) => set("url", e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={job.remote} onChange={(e) => set("remote", e.target.checked)} /> Remote</label>
      <div className="space-y-1"><Label htmlFor="description">Description</Label><Textarea id="description" rows={6} value={job.description} onChange={(e) => set("description", e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="tags">Tags (comma-separated)</Label><Input id="tags" value={job.tags} onChange={(e) => set("tags", e.target.value)} /></div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={() => void send()} disabled={busy}>Send for review</Button>
    </div>
  );
}
