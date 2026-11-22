"use client";

/** Admin store editor: change an item's price or take it off sale. People who already own an item keep it. */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Item {
  id: string;
  name: string;
  cost: number;
  kind: string;
  override: { cost?: number; disabled?: boolean } | null;
}
type Draft = Record<string, { cost: string; disabled: boolean }>;

export default function StoreEditorPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adopt = (list: Item[]) => {
    setItems(list);
    setDraft(Object.fromEntries(list.map((i) => [i.id, { cost: i.override?.cost !== undefined ? String(i.override.cost) : "", disabled: Boolean(i.override?.disabled) }])));
  };
  useEffect(() => {
    apiRequest<{ items: Item[] }>("/api/v1/admin/ops/store").then((d) => adopt(d.items)).catch((e: unknown) => setError(getErrorMessage(e, "Admins only.")));
  }, []);

  const groups = useMemo(() => ["skin", "cosmetic", "freeze"].map((k) => ({ kind: k, items: (items ?? []).filter((i) => i.kind === k) })), [items]);

  const save = async () => {
    setError(null);
    setMsg(null);
    const overrides = Object.fromEntries(Object.entries(draft).flatMap(([id, d]) => {
      const o = { ...(d.cost.trim() ? { cost: Number(d.cost) } : {}), ...(d.disabled ? { disabled: true } : {}) };
      return Object.keys(o).length ? [[id, o]] : [];
    }));
    try {
      adopt((await apiRequest<{ items: Item[] }>("/api/v1/admin/ops/store", { method: "PUT", body: { overrides } })).items);
      setMsg("Saved. The store shows the new prices now.");
    } catch (e) {
      setError(getErrorMessage(e, "Could not save."));
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div><Link href="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link><h1 className="text-2xl font-bold">Store editor</h1>
        <p className="text-sm text-muted-foreground">Leave a price empty to use the default. Free items stay free.</p></div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!items ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : (
        <>
          {groups.map((g) => (
            <section key={g.kind} className="space-y-2">
              <h2 className="font-semibold capitalize">{g.kind === "freeze" ? "Streak freezes" : `${g.kind}s`}</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Item</th><th>Default</th><th>Price</th><th>Off sale</th></tr></thead>
                <tbody>
                  {g.items.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="py-1">{i.name} <span className="text-xs text-muted-foreground font-mono">{i.id}</span></td>
                      <td>{i.cost}</td>
                      <td className="w-28"><Input aria-label={`Price of ${i.name}`} type="number" min={1} disabled={i.cost === 0} placeholder={String(i.cost)} value={draft[i.id]?.cost ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [i.id]: { cost: e.target.value, disabled: d[i.id]?.disabled ?? false } }))} /></td>
                      <td><input type="checkbox" aria-label={`Take ${i.name} off sale`} disabled={i.cost === 0} checked={draft[i.id]?.disabled ?? false} onChange={(e) => setDraft((d) => ({ ...d, [i.id]: { cost: d[i.id]?.cost ?? "", disabled: e.target.checked } }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          <Button onClick={() => void save()}>Save changes</Button>
          {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}
        </>
      )}
    </div>
  );
}
