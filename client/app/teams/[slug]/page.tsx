"use client";

/** One team: its members, and — for the owner — the invite code and member controls. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Users } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Team {
  slug: string;
  name: string;
  listed: boolean;
  members: { userId: string; username: string | null; joinedAt: string }[];
  isOwner: boolean;
  isMember: boolean;
  inviteCode?: string;
}

export default function TeamPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<Team>(`/api/v1/teams/${encodeURIComponent(slug)}`).then(setTeam).catch(() => setTeam(null));
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const post = async (path: string, body?: unknown) => {
    setError(null);
    try {
      const res = await apiRequest<Team | { deleted: boolean }>(`/api/v1/teams/${encodeURIComponent(slug)}${path}`, { method: "POST", ...(body ? { body } : {}) });
      if ("deleted" in res) router.push("/teams");
      else setTeam(res);
    } catch (e) {
      setError(getErrorMessage(e, "Something went wrong."));
    }
  };

  if (team === undefined) return null;
  if (team === null) {
    return (
      <div className="container max-w-screen-md mx-auto py-16 px-4 text-center">
        <p className="text-muted-foreground">Team not found.</p>
        <Link href="/teams" className="text-primary hover:underline text-sm">All teams</Link>
      </div>
    );
  }

  return (
    <div className="container max-w-screen-md mx-auto py-10 px-4 space-y-6">
      <div>
        <Link href="/teams" className="text-xs text-muted-foreground hover:text-foreground">← Teams</Link>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 mt-1"><Users className="w-7 h-7 text-primary" /> {team.name}</h1>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {team.isOwner && team.inviteCode && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Invite code</span>
            <code className="font-mono font-semibold tracking-wider">{team.inviteCode}</code>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => void navigator.clipboard.writeText(team.inviteCode ?? "")}>
              <Copy className="w-3 h-3" /> Copy
            </Button>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" checked={team.listed} onChange={(e) => void post("/listed", { listed: e.target.checked })} /> Listed in the directory
            </label>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Members ({team.members.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {team.members.map((m) => (
              <li key={m.userId} className="py-2 flex items-center justify-between gap-2">
                {m.username ? <Link href={`/profile/${m.username}`} className="hover:text-primary">{m.username}</Link> : <span className="text-muted-foreground">member</span>}
                {team.isOwner && m.userId !== team.members[0]?.userId && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void post("/remove", { userId: m.userId })}>Remove</Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {team.isMember && (
        <Button variant="outline" onClick={() => void post("/leave")}>{team.members.length === 1 ? "Leave and delete team" : "Leave team"}</Button>
      )}
    </div>
  );
}
