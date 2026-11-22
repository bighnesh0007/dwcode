"use client";

/** Contribute: your drafts and submissions, and where to start a new problem, question or application. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { BadgeCheck, FileCode2, HelpCircle, Loader2, UserPlus } from "lucide-react";
import { CONTRIBUTION_REWARD, OPEN_LIMIT } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { STATUS_STYLE, contributionTitle, type Contribution } from "@/lib/contribute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Mine {
  contributor: boolean;
  limit: number;
  items: Contribution[];
}

export default function ContributePage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [mine, setMine] = useState<Mine | null>(null);

  useEffect(() => {
    if (isSignedIn) apiRequest<Mine>("/api/v1/contributions").then(setMine).catch(() => setMine({ contributor: false, limit: 0, items: [] }));
  }, [isSignedIn]);

  const applied = mine?.items.some((i) => i.kind === "application" && i.status !== "rejected");

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          Contribute {mine?.contributor && <BadgeCheck className="w-5 h-5 text-primary" aria-label="Contributor" />}
        </h1>
        <p className="text-muted-foreground">
          Write a problem or a certification question. Every problem is checked automatically: your solution runs on the compiler for each
          input you give, and the outputs it produces become the expected answers. You never type an expected output by hand.
        </p>
      </div>

      {isLoaded && !isSignedIn ? (
        <SignInButton mode="modal"><Button>Sign in to contribute</Button></SignInButton>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileCode2 className="w-4 h-4" /> A problem</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">+{CONTRIBUTION_REWARD.problem} coins when it&apos;s published.</p>
              <Link href="/contribute/new/problem"><Button size="sm">New problem</Button></Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><HelpCircle className="w-4 h-4" /> A certification question</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Original MCD Level 1 practice. +{CONTRIBUTION_REWARD.question} coins.</p>
              <Link href="/contribute/new/question"><Button size="sm" variant="outline">New question</Button></Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><UserPlus className="w-4 h-4" /> Become a contributor</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Contributors get a badge and can keep {OPEN_LIMIT.contributor} drafts open at once.</p>
              {mine?.contributor ? <p className="text-sm text-primary">You&apos;re a contributor.</p>
                : applied ? <p className="text-sm text-muted-foreground">Application sent.</p>
                : <Link href="/contribute/apply"><Button size="sm" variant="outline">Apply</Button></Link>}
            </CardContent>
          </Card>
        </div>
      )}

      {isSignedIn && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Your contributions</CardTitle></CardHeader>
          <CardContent>
            {!mine ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              : mine.items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p>
              : (
                <ul className="divide-y">
                  {mine.items.map((c) => (
                    <li key={c.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <Link href={c.kind === "application" ? "/contribute" : `/contribute/${c.id}`} className="hover:underline truncate">
                        <span className="text-muted-foreground capitalize mr-2">{c.kind}</span>{contributionTitle(c)}
                      </Link>
                      <span className={`rounded px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            {mine && <p className="text-xs text-muted-foreground mt-3">You can keep {mine.limit} problems and {mine.limit} questions open (draft or submitted) at a time.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
