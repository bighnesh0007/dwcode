"use client";

/** Admin audit log: every admin action, newest first. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";

interface Entry {
  _id: string;
  actorId: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((before?: string) => {
    apiRequest<{ entries: Entry[] }>(`/api/v1/admin/ops/audit${before ? `?before=${encodeURIComponent(before)}` : ""}`)
      .then((d) => { setEntries((xs) => (before ? [...(xs ?? []), ...d.entries] : d.entries)); setMore(d.entries.length === 100); })
      .catch((e: unknown) => setError(getErrorMessage(e, "Admins only.")));
  }, []);
  useEffect(() => load(), [load]);

  return (
    <div className="container max-w-5xl mx-auto py-10 px-4 space-y-6">
      <div><Link href="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link><h1 className="text-2xl font-bold">Audit log</h1></div>
      {error && <p className="text-red-500">{error}</p>}
      {!entries ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : entries.length === 0 ? <p className="text-muted-foreground">No admin actions yet.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e._id} className="border-t align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="pr-2 font-mono text-xs">{e.actorId}</td>
                <td className="pr-2">{e.action}</td>
                <td className="pr-2 font-mono text-xs break-all">{e.target}</td>
                <td className="font-mono text-xs break-all">{Object.keys(e.detail).length ? JSON.stringify(e.detail) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {entries && more && <Button variant="outline" size="sm" onClick={() => load(entries.at(-1)?.createdAt)}>Older</Button>}
    </div>
  );
}
