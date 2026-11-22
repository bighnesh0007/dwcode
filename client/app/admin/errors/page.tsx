"use client";

/** Admin error inbox: client errors and CSP reports grouped by fingerprint; resolve one and it reopens if it happens again. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ClientErr {
  fingerprint: string;
  kind: "error" | "csp";
  message: string;
  source: string;
  sample: { url?: string; stack?: string; userAgent?: string };
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export default function ErrorInboxPage() {
  const [resolved, setResolved] = useState(false);
  const [errors, setErrors] = useState<ClientErr[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<{ errors: ClientErr[] }>(`/api/v1/admin/ops/errors?resolved=${resolved}`).then((d) => setErrors(d.errors)).catch((e: unknown) => setError(getErrorMessage(e, "Admins only.")));
  }, [resolved]);
  useEffect(load, [load]);

  const resolve = async (fp: string) => {
    try {
      await apiRequest(`/api/v1/admin/ops/errors/${fp}/resolve`, { method: "POST" });
      setErrors((xs) => xs?.filter((x) => x.fingerprint !== fp) ?? null);
    } catch (e) {
      setError(getErrorMessage(e, "Could not resolve."));
    }
  };

  return (
    <div className="container max-w-5xl mx-auto py-10 px-4 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><Link href="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link><h1 className="text-2xl font-bold">Error inbox</h1></div>
        <div className="flex gap-1">
          <Button size="sm" variant={resolved ? "outline" : "default"} onClick={() => setResolved(false)}>Open</Button>
          <Button size="sm" variant={resolved ? "default" : "outline"} onClick={() => setResolved(true)}>Resolved</Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!errors ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : errors.length === 0 ? <p className="text-muted-foreground">{resolved ? "Nothing resolved yet." : "No open errors."}</p> : (
        <div className="space-y-3">
          {errors.map((e) => (
            <Card key={e.fingerprint}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="text-left min-w-0" onClick={() => setOpen(open === e.fingerprint ? null : e.fingerprint)} aria-expanded={open === e.fingerprint}>
                    <p className="text-sm font-medium break-words"><span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{e.kind}</span>{e.message}</p>
                    <p className="text-xs text-muted-foreground">{e.count}× · last {new Date(e.lastSeen).toLocaleString()} · first {new Date(e.firstSeen).toLocaleDateString()}{e.sample.url ? ` · ${e.sample.url}` : ""}</p>
                  </button>
                  {!resolved && <Button size="sm" variant="outline" onClick={() => void resolve(e.fingerprint)}>Resolve</Button>}
                </div>
                {open === e.fingerprint && (
                  <div className="text-xs space-y-1">
                    {e.source && <p className="font-mono break-all">{e.source}</p>}
                    {e.sample.userAgent && <p className="text-muted-foreground">{e.sample.userAgent}</p>}
                    {e.sample.stack && <pre className="rounded bg-muted p-2 overflow-x-auto">{e.sample.stack}</pre>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
