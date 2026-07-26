"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Star, CheckCircle2, Circle, CircleDot, Shuffle } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import type { BookmarkSummary, ProblemSummary, SubmissionSummary } from "@/lib/types";
import { DIFFICULTIES, difficultyClassName } from "@dwcode/shared";

// Difficulty filters derive from the shared registry, so a new tier appears
// in the filter bar automatically (REF-01).
const DIFFICULTY_TAGS: string[] = [...DIFFICULTIES];
const STATIC_TAGS = ["All", "Bookmarked", "Solved", "Attempted"];
const CATEGORY_TAGS = ["Arrays", "Objects", "Transformations", "JSON", "Manual"];
const FILTER_TAGS = [...STATIC_TAGS, ...DIFFICULTY_TAGS, ...CATEGORY_TAGS];

function ProblemsList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") || "";

  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [search, setSearch] = useState(q);
  const [selectedTag, setSelectedTag] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [pRes, sRes, bRes] = await Promise.all([
          fetch("/api/problems"),
          fetch("/api/submissions"),
          fetch("/api/bookmarks"),
        ]);
        const [pData, sData, bData] = await Promise.all([pRes.json(), sRes.json(), bRes.json()]);
        if (Array.isArray(pData)) setProblems(pData);
        if (Array.isArray(sData)) setSubmissions(sData);
        if (Array.isArray(bData)) {
          setBookmarks((bData as BookmarkSummary[]).map((bookmark) => bookmark.problemId));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // Derive solved/attempted slugs from submissions
  const solvedSlugs = new Set(submissions.filter(s => s.status === "Accepted").map(s => s.problemSlug));
  const attemptedSlugs = new Set(submissions.filter(s => s.status !== "Accepted").map(s => s.problemSlug));

  const getProblemStatus = (slug: string) => {
    if (solvedSlugs.has(slug)) return "solved";
    if (attemptedSlugs.has(slug)) return "attempted";
    return "unsolved";
  };

  /**
   * Jump to a random UNSOLVED problem, falling back to any problem once
   * everything is solved. Picking at random from the whole set kept sending
   * people back to problems they had already finished.
   */
  const handleRandom = () => {
    if (problems.length === 0) return;
    const unsolved = problems.filter((p) => !solvedSlugs.has(p.slug));
    const pool = unsolved.length > 0 ? unsolved : problems;
    const random = pool[Math.floor(Math.random() * pool.length)];
    router.push(`/problems/${random.slug}`);
  };

  // ── Progress ────────────────────────────────────────────────────────────────
  const progress = (() => {
    const total = problems.length;
    const solved = problems.filter((p) => solvedSlugs.has(p.slug)).length;
    const byDifficulty = DIFFICULTY_TAGS.map((d) => {
      const inTier = problems.filter((p) => p.difficulty === d);
      return {
        difficulty: d,
        total: inTier.length,
        solved: inTier.filter((p) => solvedSlugs.has(p.slug)).length,
      };
    });
    return { total, solved, byDifficulty };
  })();

  const filteredProblems = problems.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.tags || []).some((t: string) => t.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedTag === "All") return true;
    if (selectedTag === "Bookmarked") return bookmarks.includes(p._id);
    if (selectedTag === "Solved") return solvedSlugs.has(p.slug);
    if (selectedTag === "Attempted") return attemptedSlugs.has(p.slug) && !solvedSlugs.has(p.slug);
    if (DIFFICULTY_TAGS.includes(selectedTag)) return p.difficulty === selectedTag;
    return p.category === selectedTag || (p.tags || []).includes(selectedTag);
  });

  /**
   * Status indicator.
   *
   * Accessibility: state is NEVER conveyed by colour alone (WCAG 1.4.1) — each
   * state has a distinct glyph plus a screen-reader label, so the list is usable
   * in greyscale and to assistive tech.
   */
  const StatusIcon = ({ slug }: { slug: string }) => {
    const status = getProblemStatus(slug);
    if (status === "solved") {
      return (
        <span title="Solved">
          <CheckCircle2 className="w-4 h-4 text-green-500" aria-hidden />
          <span className="sr-only">Solved</span>
        </span>
      );
    }
    if (status === "attempted") {
      return (
        <span title="Attempted — not solved yet">
          <CircleDot className="w-4 h-4 text-amber-500" aria-hidden />
          <span className="sr-only">Attempted, not solved yet</span>
        </span>
      );
    }
    return (
      <span title="Not attempted">
        <Circle className="w-4 h-4 text-muted-foreground/40" aria-hidden />
        <span className="sr-only">Not attempted</span>
      </span>
    );
  };

  // Colours come from the shared registry — no per-tier ternaries to update.
  const difficultyClass = (difficulty: string) => difficultyClassName(difficulty).text;
  const accentClass = (difficulty: string) => difficultyClassName(difficulty).accent;

  return (
    <div className="container max-w-screen-xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Problems</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {loading ? "Loading…" : `${filteredProblems.length} of ${problems.length} problems`}
          </p>
        </div>
        <div className="flex w-full md:w-auto gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search title or tag…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRandom}
            title="Jump to a random unsolved problem"
          >
            <Shuffle className="w-4 h-4" />
            <span className="sr-only">Random unsolved problem</span>
          </Button>
        </div>
      </div>

      {/*
        Progress. Shows what is LEFT rather than only what is done — "12 to go"
        is a call to action in a way that "8 solved" is not.
      */}
      {!loading && progress.total > 0 && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {progress.solved} of {progress.total} solved
              {progress.solved < progress.total && (
                <span className="ml-2 text-muted-foreground">
                  · {progress.total - progress.solved} to go
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {Math.round((progress.solved / progress.total) * 100)}%
            </p>
          </div>

          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress.solved}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label={`${progress.solved} of ${progress.total} problems solved`}
          >
            {/*
              `motion-reduce:transition-none` — the bar animates on load, which is
              exactly the kind of movement people with vestibular sensitivity turn
              off at the OS level.
            */}
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${(progress.solved / progress.total) * 100}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {progress.byDifficulty
              .filter((tier) => tier.total > 0)
              .map((tier) => (
                <span key={tier.difficulty} className="text-xs">
                  <span className={`font-medium ${difficultyClass(tier.difficulty)}`}>
                    {tier.difficulty}
                  </span>
                  <span className="ml-1.5 text-muted-foreground tabular-nums">
                    {tier.solved}/{tier.total}
                  </span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Filter Tags */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TAGS.map((tag) => (
          <Badge
            key={tag}
            variant={selectedTag === tag ? "default" : "secondary"}
            className="cursor-pointer select-none transition-colors"
            onClick={() => setSelectedTag(tag)}
          >
            {tag === "Bookmarked" && <Star className="w-3 h-3 mr-1" />}
            {tag}
          </Badge>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-10 text-center">✓</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Tags</TableHead>
              <TableHead className="w-10 text-center hidden sm:table-cell">★</TableHead>
              <TableHead className="text-right w-24">Difficulty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <div className="h-5 bg-muted/50 rounded animate-pulse w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredProblems.length > 0 ? (
              filteredProblems.map((problem) => {
                const status = getProblemStatus(problem.slug);
                const isSolved = status === "solved";
                const isAttempted = status === "attempted";
                return (
                <TableRow
                  key={problem._id}
                  className={[
                    // Fixed height keeps the Difficulty column aligned all the
                    // way down, regardless of title length or tag count.
                    "group relative h-14 transition-colors",
                    // A difficulty-tinted left accent marks work still to do.
                    // Solved rows lose it entirely so finished work recedes.
                    "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:transition-opacity",
                    isSolved
                      ? "before:opacity-0 hover:bg-muted/20"
                      : `${accentClass(problem.difficulty)} before:opacity-60 group-hover:before:opacity-100 hover:bg-muted/40`,
                    isAttempted ? "bg-amber-500/[0.04]" : "",
                  ].join(" ")}
                >
                  <TableCell className="text-center">
                    <StatusIcon slug={problem.slug} />
                  </TableCell>
                  {/* Long titles truncate rather than wrap, for the same
                      row-height consistency reason as the tags column. */}
                  <TableCell className="font-medium max-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        href={`/problems/${problem.slug}`}
                        title={problem.title}
                        className={[
                          "truncate transition-colors group-hover:underline underline-offset-2 hover:text-primary",
                          // Solved titles are de-emphasised but must stay legible —
                          // muted-foreground, not a low-contrast grey.
                          isSolved ? "text-muted-foreground" : "text-foreground",
                        ].join(" ")}
                      >
                        {problem.title}
                      </Link>
                      {isAttempted && (
                        <span className="shrink-0 whitespace-nowrap rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          In progress
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {/*
                    Tags stay on ONE line.

                    This was `flex-wrap`, so a problem with three tags wrapped to
                    two or three lines. That made every row a different height and
                    knocked the Difficulty column out of alignment down the table.
                    `flex-nowrap` + `overflow-hidden` keeps rows uniform; anything
                    that does not fit is summarised by the +N badge below.
                  */}
                  <TableCell className="hidden md:table-cell max-w-[20rem]">
                    <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
                      {(problem.tags || []).slice(0, 3).map((t: string) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-[10px] py-0 shrink-0 whitespace-nowrap max-w-[10rem] truncate"
                        >
                          {t}
                        </Badge>
                      ))}
                      {(problem.tags?.length ?? 0) > 3 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 shrink-0 whitespace-nowrap text-muted-foreground"
                          title={problem.tags.slice(3).join(", ")}
                        >
                          +{problem.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center hidden sm:table-cell">
                    {bookmarks.includes(problem._id) && (
                      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`text-sm font-medium ${difficultyClass(problem.difficulty)} ${
                        isSolved ? "opacity-60" : ""
                      }`}
                    >
                      {problem.difficulty}
                    </span>
                  </TableCell>
                </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                  {problems.length === 0
                    ? "No problems yet — head to Admin to add some!"
                    : "No problems match your search."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function ProblemsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <ProblemsList />
    </Suspense>
  );
}
