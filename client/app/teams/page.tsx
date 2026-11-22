"use client";

/** Teams: the directory, your team, and creating or joining one by invite code. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Users } from "lucide-react";
import { TEAM_LIMITS } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface TeamSummary { slug: string; name: string; members: number }
interface MyTeam { slug: string; name: string; members: unknown[]; isOwner: boolean; inviteCode?: string }

export default function TeamsPage() {
  const { isSignedIn } = useAuth();
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [mine, setMine] = useState<MyTeam | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [listed, setListed] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiRequest<{ teams: TeamSummary[] }>("/api/v1/teams").then((d) => setTeams(d.teams)).catch(() => setTeams([]));
    if (isSignedIn) apiRequest<{ team: MyTeam | null }>("/api/v1/teams/mine").then((d) => setMine(d.team)).catch(() => setMine(null));
  }, [isSignedIn]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(path, { method: "POST", body });
      setName("");
      setCode("");
      load();
    } catch (e) {
      setError(getErrorMessage(e, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-screen-md mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><Users className="w-7 h-7 text-primary" /> Teams</h1>
        <p className="text-muted-foreground mt-1">Practise together. A team&apos;s score is the sum of its members&apos; scores, ranked on the leaderboard.</p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {isSignedIn && mine && (
        <Card className="border-primary/40">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Your team</p>
              <Link href={`/teams/${mine.slug}`} className="text-lg font-semibold hover:text-primary">{mine.name}</Link>
            </div>
            <span className="text-sm text-muted-foreground">{mine.members.length}/{TEAM_LIMITS.maxMembers} members</span>
          </CardContent>
        </Card>
      )}

      {isSignedIn && mine === null && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Create a team</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={TEAM_LIMITS.nameMax} placeholder="Team name" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} /> Show in the directory
              </label>
              <Button size="sm" disabled={busy || name.trim().length < TEAM_LIMITS.nameMin} onClick={() => void act("/api/v1/teams", { name, listed })}>Create</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Join with a code</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="Invite code" />
              <Button size="sm" disabled={busy || code.trim().length < 4} onClick={() => void act("/api/v1/teams/join", { code })}>Join</Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Directory</CardTitle></CardHeader>
        <CardContent>
          {!teams ? null : teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No listed teams yet. Start one!</p>
          ) : (
            <ul className="divide-y">
              {teams.map((t) => (
                <li key={t.slug} className="py-2 flex items-center justify-between">
                  <Link href={`/teams/${t.slug}`} className="font-medium hover:text-primary">{t.name}</Link>
                  <span className="text-xs text-muted-foreground">{t.members} member{t.members === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
