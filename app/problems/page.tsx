"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Star, CheckCircle2, Circle, Shuffle } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";

const DIFFICULTY_TAGS = ["Easy", "Medium", "Hard"];
const FILTER_TAGS = ["All", "Bookmarked", "Solved", "Attempted", "Easy", "Medium", "Hard", "Arrays", "Objects", "Transformations", "JSON", "Manual"];

function ProblemsList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") || "";

  const [problems, setProblems] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
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
        if (Array.isArray(bData)) setBookmarks(bData.map((b: any) => b.problemId));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Derive solved/attempted slugs from submissions
  const solvedSlugs = new Set(submissions.filter(s => s.status === "Accepted").map(s => s.problemSlug));
  const attemptedSlugs = new Set(submissions.filter(s => s.status !== "Accepted").map(s => s.problemSlug));

  const getProblemStatus = (slug: string) => {
    if (solvedSlugs.has(slug)) return "solved";
    if (attemptedSlugs.has(slug)) return "attempted";
    return "unsolved";
  };

  const handleRandom = () => {
    if (problems.length === 0) return;
    const random = problems[Math.floor(Math.random() * problems.length)];
    router.push(`/problems/${random.slug}`);
  };

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

  const StatusIcon = ({ slug }: { slug: string }) => {
    const status = getProblemStatus(slug);
    if (status === "solved") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "attempted") return <Circle className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />;
    return <Circle className="w-4 h-4 text-muted-foreground/30" />;
  };

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
          <Button variant="outline" size="icon" onClick={handleRandom} title="Random Problem">
            <Shuffle className="w-4 h-4" />
          </Button>
        </div>
      </div>

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
              filteredProblems.map((problem) => (
                <TableRow key={problem._id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="text-center">
                    <StatusIcon slug={problem.slug} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/problems/${problem.slug}`}
                      className="hover:text-primary transition-colors group-hover:underline underline-offset-2"
                    >
                      {problem.title}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(problem.tags || []).slice(0, 3).map((t: string) => (
                        <Badge key={t} variant="outline" className="text-[10px] py-0">{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-center hidden sm:table-cell">
                    {bookmarks.includes(problem._id) && (
                      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`text-sm font-medium ${
                      problem.difficulty === "Easy" ? "text-green-500" :
                      problem.difficulty === "Medium" ? "text-yellow-500" : "text-red-500"
                    }`}>
                      {problem.difficulty}
                    </span>
                  </TableCell>
                </TableRow>
              ))
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
