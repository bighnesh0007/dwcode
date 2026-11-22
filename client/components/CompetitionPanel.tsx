"use client";

/** Contest rating, its history, and the country used for the country leaderboard. */
import { useEffect, useState } from "react";
import { Flag, Medal } from "lucide-react";
import { COUNTRIES, RATING_TIERS, type RatingPoint } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MyRating { rating: number | null; tier: string | null; history: RatingPoint[] }

export function CompetitionPanel({ initialCountry }: { initialCountry?: string | null }) {
  const [rating, setRating] = useState<MyRating | null>(null);
  const [country, setCountry] = useState<string>(initialCountry ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<MyRating>("/api/v1/ratings/me").then(setRating).catch(() => {});
  }, []);

  const save = (value: string) => {
    setCountry(value);
    setSaved(null);
    apiRequest("/api/v1/profile-country", { method: "PUT", body: { country: value || null } })
      .then(() => setSaved("Saved"))
      .catch(() => setSaved("Could not save"));
  };

  const tier = RATING_TIERS.find((t) => t.id === rating?.tier);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Medal className="w-4 h-4 text-primary" /> Contests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rating?.rating != null ? (
          <div>
            <p className="text-2xl font-semibold tabular-nums">{rating.rating} <span className="text-sm font-normal text-muted-foreground">{tier?.label}</span></p>
            <div className="mt-2 flex items-end gap-1 h-10" aria-label="Rating history">
              {rating.history.slice(-20).map((p) => (
                <span
                  key={p.contestId}
                  title={`#${p.rank} · ${p.delta >= 0 ? "+" : ""}${p.delta} → ${p.rating}`}
                  className={`w-2 rounded-sm ${p.delta >= 0 ? "bg-green-500/70" : "bg-red-500/70"}`}
                  style={{ height: `${Math.min(100, 20 + Math.abs(p.delta) * 2.5)}%` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Enter a contest to get a rating.</p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Flag className="w-4 h-4 text-muted-foreground" />
          <select
            value={country}
            onChange={(e) => save(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label="Country"
          >
            <option value="">Country (optional)</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          {saved && <span className="text-xs text-muted-foreground">{saved}</span>}
        </label>
      </CardContent>
    </Card>
  );
}
