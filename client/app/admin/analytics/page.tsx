"use client";

/** Admin analytics: users, daily submissions and page views for 30 days, top pages, open errors and the review queue. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Analytics {
  users: { total: number; newThisWeek: number };
  daily: { day: string; submissions: number; accepted: number; views: number }[];
  topPaths: { path: string; count: number }[];
  openErrors: number;
  reviewQueue: number;
}

function Bars({ values, label, className }: { values: { day: string; n: number }[]; label: string; className: string }) {
  const max = Math.max(1, ...values.map((v) => v.n));
  return (
    <figure>
      <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={label}>
        {values.map((v) => <div key={v.day} title={`${v.day}: ${v.n}`} className={`flex-1 rounded-t ${className}`} style={{ height: `${Math.max(2, (v.n / max) * 100)}%` }} />)}
      </div>
      <figcaption className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{values[0]?.day}</span><span>max {max}</span><span>{values.at(-1)?.day}</span></figcaption>
    </figure>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiRequest<Analytics>("/api/v1/admin/ops/analytics").then(setData).catch((e: unknown) => setError(getErrorMessage(e, "Admins only.")));
  }, []);

  if (error) return <div className="container py-16 text-center text-red-500">{error}</div>;
  if (!data) return <div className="container py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const sum = (k: "submissions" | "accepted" | "views") => data.daily.reduce((n, d) => n + d[k], 0);
  return (
    <div className="container max-w-5xl mx-auto py-10 px-4 space-y-6">
      <div><Link href="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link><h1 className="text-2xl font-bold">Analytics</h1></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {([
          { label: "Users", value: data.users.total, sub: `+${data.users.newThisWeek} this week` },
          { label: "Submissions (30d)", value: sum("submissions"), sub: `${sum("accepted")} accepted` },
          { label: "Page views (30d)", value: sum("views"), sub: "anonymous" },
          { label: "Open errors", value: data.openErrors, sub: <Link href="/admin/errors" className="underline">inbox</Link> },
          { label: "Review queue", value: data.reviewQueue, sub: <Link href="/admin/contributions" className="underline">review</Link> },
        ] as { label: string; value: number; sub: React.ReactNode }[]).map((c) => (
          <Card key={c.label}><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground font-medium">{c.label}</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{c.value}</p><p className="text-xs text-muted-foreground">{c.sub}</p></CardContent></Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Submissions per day</CardTitle></CardHeader>
          <CardContent><Bars label="Submissions per day" className="bg-primary" values={data.daily.map((d) => ({ day: d.day, n: d.submissions }))} /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Page views per day</CardTitle></CardHeader>
          <CardContent><Bars label="Page views per day" className="bg-sky-500" values={data.daily.map((d) => ({ day: d.day, n: d.views }))} /></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Top pages (7 days)</CardTitle></CardHeader>
        <CardContent>
          {data.topPaths.length === 0 ? <p className="text-sm text-muted-foreground">No views yet.</p> : (
            <table className="w-full text-sm"><tbody>{data.topPaths.map((p) => <tr key={p.path} className="border-t"><td className="py-1 font-mono text-xs">{p.path}</td><td className="text-right">{p.count}</td></tr>)}</tbody></table>
          )}
        </CardContent></Card>
    </div>
  );
}
