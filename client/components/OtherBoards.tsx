"use client";

/** Contest rating, team and country leaderboards, as tabs beside the points board. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Flag, Medal, Users } from "lucide-react";
import { COUNTRIES, RATING_TIERS } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RatingRow { rank: number; userId: string; userName: string; rating: number; tier: string; contests: number }
interface GroupRow { rank: number; key: string; name: string; members: number; score: number }

const tierLabel = (id: string) => RATING_TIERS.find((t) => t.id === id)?.label ?? id;
const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
const flag = (code: string) => code.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));

/** Fetch a board's rows the first time its tab is opened. */
function useRows<T>(path: string, enabled: boolean, initial: T[] | null = null): T[] | null {
  const [rows, setRows] = useState<T[] | null>(initial);
  useEffect(() => {
    if (!enabled || rows) return;
    apiRequest<{ rows: T[] }>(path).then((d) => setRows(d.rows)).catch(() => setRows([]));
  }, [path, enabled, rows]);
  return rows;
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{text}</p>;
}

export function OtherBoards() {
  const [tab, setTab] = useState("rating");
  const ratings = useRows<RatingRow>("/api/v1/ratings", tab === "rating");
  const teams = useRows<GroupRow>("/api/v1/leaderboards/teams", tab === "teams");
  const countries = useRows<GroupRow>("/api/v1/leaderboards/countries", tab === "countries");

  return (
    <Card>
      <CardContent className="p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="rating" className="text-xs gap-1"><Medal className="w-3.5 h-3.5" /> Contest rating</TabsTrigger>
            <TabsTrigger value="teams" className="text-xs gap-1"><Users className="w-3.5 h-3.5" /> Teams</TabsTrigger>
            <TabsTrigger value="countries" className="text-xs gap-1"><Flag className="w-3.5 h-3.5" /> Countries</TabsTrigger>
          </TabsList>

          <TabsContent value="rating" className="mt-3">
            {!ratings ? null : ratings.length === 0 ? (
              <Empty text="No rated contests yet. Ratings appear after a public contest ends." />
            ) : (
              <ol className="divide-y text-sm">
                {ratings.map((r) => (
                  <li key={r.userId} className="flex items-center gap-3 py-2">
                    <span className="w-6 text-muted-foreground tabular-nums">{r.rank}</span>
                    <span className="flex-1 truncate">{r.userName || "anonymous"}</span>
                    <span className="text-xs text-muted-foreground">{tierLabel(r.tier)} · {r.contests} contest{r.contests === 1 ? "" : "s"}</span>
                    <span className="font-semibold tabular-nums w-14 text-right">{r.rating}</span>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="teams" className="mt-3">
            {!teams ? null : teams.length === 0 ? (
              <Empty text="No teams yet." />
            ) : (
              <ol className="divide-y text-sm">
                {teams.map((t) => (
                  <li key={t.key} className="flex items-center gap-3 py-2">
                    <span className="w-6 text-muted-foreground tabular-nums">{t.rank}</span>
                    <Link href={`/teams/${t.key}`} className="flex-1 truncate hover:text-primary">{t.name}</Link>
                    <span className="text-xs text-muted-foreground">{t.members} member{t.members === 1 ? "" : "s"}</span>
                    <span className="font-semibold tabular-nums w-14 text-right">{t.score}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-muted-foreground mt-2"><Link href="/teams" className="text-primary hover:underline">Create or join a team →</Link></p>
          </TabsContent>

          <TabsContent value="countries" className="mt-3">
            {!countries ? null : countries.length === 0 ? (
              <Empty text="No one has set a country yet. Set yours on your profile." />
            ) : (
              <ol className="divide-y text-sm">
                {countries.map((c) => (
                  <li key={c.key} className="flex items-center gap-3 py-2">
                    <span className="w-6 text-muted-foreground tabular-nums">{c.rank}</span>
                    <span className="flex-1 truncate">{flag(c.key)} {countryName(c.key)}</span>
                    <span className="text-xs text-muted-foreground">{c.members} member{c.members === 1 ? "" : "s"}</span>
                    <span className="font-semibold tabular-nums w-14 text-right">{c.score}</span>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
