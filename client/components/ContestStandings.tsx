"use client";

/**
 * Live contest standings, computed by the server from submissions inside the
 * contest window: points, penalty minutes, and a cell per problem. Refreshes
 * every 30 seconds while the contest runs.
 */
import Image from "next/image";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import type { StandingRow } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Standings {
  status: "upcoming" | "active" | "ended";
  problems: { slug: string; title: string; difficulty: string }[];
  rows: (StandingRow & { userName: string; userImageUrl: string })[];
}

const MEDAL = ["bg-yellow-400 text-yellow-900", "bg-slate-400 text-slate-900", "bg-amber-700 text-white"];

export function ContestStandings({ contestId, viewerId }: { contestId: string; viewerId?: string | null }) {
  const [data, setData] = useState<Standings | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      apiRequest<Standings>(`/api/v1/contests/${contestId}/standings`)
        .then((d) => { if (alive) setData(d); })
        .catch(() => {});
    };
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [contestId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" /> Standings ({data?.rows.length ?? 0})
          {data?.status === "active" && <span className="text-[10px] font-normal text-green-500">● live</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!data ? null : data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No participants yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium pb-2">#</th>
                <th className="text-left font-medium pb-2">Player</th>
                <th className="text-right font-medium pb-2">Points</th>
                <th className="text-right font-medium pb-2" title="Minutes to each solve plus 5 per wrong attempt">Penalty</th>
                {data.problems.map((p, i) => (
                  <th key={p.slug} className="text-center font-medium pb-2 px-1" title={p.title}>{String.fromCharCode(65 + i)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId} className={cn("border-t", r.userId === viewerId && "bg-primary/5")}>
                  <td className="py-2 pr-2">
                    <span className={cn("w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold", MEDAL[r.rank - 1] ?? "bg-muted text-muted-foreground")}>
                      {r.rank}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      {r.userImageUrl ? (
                        <Image unoptimized src={r.userImageUrl} width={20} height={20} className="w-5 h-5 rounded-full" alt="" />
                      ) : null}
                      <span className="truncate max-w-[10rem]">{r.userName || "anonymous"}</span>
                      {r.userId === viewerId && <Badge variant="outline" className="text-[10px] py-0">You</Badge>}
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">{r.points}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{r.penalty}</td>
                  {data.problems.map((p) => {
                    const cell = r.problems[p.slug];
                    return (
                      <td key={p.slug} className="py-2 text-center text-xs tabular-nums">
                        {cell?.solvedAt != null ? (
                          <span className="text-green-500 font-medium">{cell.solvedAt}′{cell.wrong ? <sup className="text-muted-foreground">+{cell.wrong}</sup> : null}</span>
                        ) : cell?.wrong ? (
                          <span className="text-red-500">−{cell.wrong}</span>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
