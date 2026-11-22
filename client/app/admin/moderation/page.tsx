"use client";

/** Admin moderation: hide blog posts and comments, suspend users (optionally for a number of days), and undo. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Kind = "blog" | "comment" | "user";
interface Row { kind: Kind; ref: string; reason: string; actorId: string; until: string | null; createdAt: string }

const KINDS: { id: Kind; title: string; refLabel: string }[] = [
  { id: "blog", title: "Hidden blog posts", refLabel: "Post slug" },
  { id: "comment", title: "Hidden comments", refLabel: "Comment id" },
  { id: "user", title: "Suspended users", refLabel: "User id" },
];

export default function ModerationPage() {
  const [data, setData] = useState<Record<Kind, Row[]> | null>(null);
  const [form, setForm] = useState<Record<Kind, { ref: string; reason: string; days: string }>>({
    blog: { ref: "", reason: "", days: "" }, comment: { ref: "", reason: "", days: "" }, user: { ref: "", reason: "", days: "" },
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<Record<Kind, Row[]>>("/api/v1/admin/ops/moderation").then(setData).catch((e: unknown) => setError(getErrorMessage(e, "Admins only.")));
  }, []);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); load(); } catch (e) { setError(getErrorMessage(e, "That didn't work.")); }
  };
  const add = (kind: Kind) => act(async () => {
    const f = form[kind];
    await apiRequest("/api/v1/admin/ops/moderation", { method: "PUT", body: { kind, ref: f.ref.trim(), reason: f.reason, ...(kind === "user" && f.days ? { days: Number(f.days) } : {}) } });
    setForm((x) => ({ ...x, [kind]: { ref: "", reason: "", days: "" } }));
  });
  const undo = (kind: Kind, ref: string) => act(() => apiRequest(`/api/v1/admin/ops/moderation/${kind}/${encodeURIComponent(ref)}`, { method: "DELETE" }));

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div><Link href="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link><h1 className="text-2xl font-bold">Moderation</h1>
        <p className="text-sm text-muted-foreground">Hidden content disappears for everyone. Suspended users can still read, but can&apos;t post, comment, submit or buy.</p></div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!data ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : KINDS.map((k) => (
        <Card key={k.id}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{k.title}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><Label htmlFor={`${k.id}-ref`}>{k.refLabel}</Label><Input id={`${k.id}-ref`} value={form[k.id].ref} onChange={(e) => setForm((x) => ({ ...x, [k.id]: { ...x[k.id], ref: e.target.value } }))} /></div>
              <div className="space-y-1 flex-1 min-w-40"><Label htmlFor={`${k.id}-reason`}>Reason</Label><Input id={`${k.id}-reason`} value={form[k.id].reason} onChange={(e) => setForm((x) => ({ ...x, [k.id]: { ...x[k.id], reason: e.target.value } }))} /></div>
              {k.id === "user" && <div className="space-y-1 w-24"><Label htmlFor="user-days">Days</Label><Input id="user-days" type="number" min={1} placeholder="∞" value={form.user.days} onChange={(e) => setForm((x) => ({ ...x, user: { ...x.user, days: e.target.value } }))} /></div>}
              <Button size="sm" onClick={() => void add(k.id)} disabled={!form[k.id].ref.trim()}>{k.id === "user" ? "Suspend" : "Hide"}</Button>
            </div>
            {data[k.id].length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
              <ul className="divide-y text-sm">
                {data[k.id].map((r) => (
                  <li key={r.ref} className="py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0"><span className="font-mono text-xs break-all">{r.ref}</span>{r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}{r.until && <span className="text-muted-foreground"> · until {new Date(r.until).toLocaleDateString()}</span>}</span>
                    <Button size="sm" variant="ghost" onClick={() => void undo(k.id, r.ref)}>{k.id === "user" ? "Unsuspend" : "Unhide"}</Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
