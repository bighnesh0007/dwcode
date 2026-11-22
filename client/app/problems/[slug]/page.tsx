import Workspace from "./Workspace";
import { notFound } from "next/navigation";
import { serverApiOrNull } from "@/lib/serverApi";
import type { Problem } from "@/lib/types";
import { getDifficultyTier } from "@dwcode/shared";
import { JsonLd, SITE_URL } from "@/components/JsonLd";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Forwards the visitor's session: the API sends the solution and hidden cases to admins only.
  const problem = await serverApiOrNull<Problem>(`/api/v1/problems/${encodeURIComponent(slug)}`);
  if (!problem) {
    notFound();
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[44rem] flex-col">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "LearningResource",
        name: problem.title,
        description: problem.description.slice(0, 300),
        url: `${SITE_URL}/problems/${problem.slug}`,
        learningResourceType: "Coding exercise",
        educationalLevel: getDifficultyTier(problem.difficulty)?.label ?? problem.difficulty,
        about: ["DataWeave", problem.category].filter(Boolean),
        isAccessibleForFree: true,
        inLanguage: "en",
      }} />
      <Workspace problem={problem} />
    </div>
  );
}
