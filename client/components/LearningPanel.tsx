/** The concepts a problem exercises, linked to the official DataWeave docs. */
import { BookOpen, ExternalLink } from "lucide-react";
import { conceptsFor } from "@/lib/learning";

export function LearningPanel({ category, tags }: { category?: string; tags?: readonly string[] }) {
  const concepts = conceptsFor(category, tags);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold flex items-center gap-1.5">
        <BookOpen className="w-4 h-4 text-primary" /> Concepts in this problem
      </p>
      {concepts.map((c) => (
        <div key={c.title} className="rounded-lg border p-3">
          <a href={c.docs} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-primary inline-flex items-center gap-1">
            {c.title} <ExternalLink className="w-3 h-3" />
          </a>
          <p className="text-xs text-muted-foreground mt-1">{c.summary}</p>
        </div>
      ))}
    </div>
  );
}
