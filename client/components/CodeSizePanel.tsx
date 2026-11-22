"use client";

/** Code-size ranking for a problem: smallest Accepted solutions, comments and whitespace excluded. */
import { useEffect, useState } from "react";
import { Ruler } from "lucide-react";
import { codeSize } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";

interface Ranking {
  top: { rank: number; username: string; size: number }[];
  solvers: number;
  mine?: { rank: number; size: number; percentile: number } | null;
}

export function CodeSizePanel({ slug, code, refreshKey }: { slug: string; code: string; refreshKey: number }) {
  const [ranking, setRanking] = useState<Ranking | null>(null);

  useEffect(() => {
    apiRequest<Ranking>(`/api/v1/code-size/${encodeURIComponent(slug)}`).then(setRanking).catch(() => {});
  }, [slug, refreshKey]);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold flex items-center gap-1.5">
        <Ruler className="w-4 h-4 text-primary" /> Code size
        <span className="text-xs font-normal text-muted-foreground">your current script: {codeSize(code)} chars</span>
      </p>
      <p className="text-xs text-muted-foreground">Characters in an Accepted solution, ignoring comments and whitespace. Smaller ranks higher.</p>
      {!ranking ? null : ranking.solvers === 0 ? (
        <p className="text-xs text-muted-foreground">No one has solved this yet. Be the first.</p>
      ) : (
        <>
          {ranking.mine && (
            <p className="text-xs">
              Your best: <span className="font-semibold">{ranking.mine.size}</span> chars, #{ranking.mine.rank} of {ranking.solvers}
              {ranking.solvers > 1 && <> · shorter than {ranking.mine.percentile}% of solvers</>}
            </p>
          )}
          <ol className="text-xs divide-y rounded-lg border">
            {ranking.top.map((r) => (
              <li key={r.rank} className="flex items-center justify-between px-3 py-1.5">
                <span><span className="text-muted-foreground w-6 inline-block">#{r.rank}</span>{r.username}</span>
                <span className="font-mono tabular-nums">{r.size}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
