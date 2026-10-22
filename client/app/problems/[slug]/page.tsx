import Workspace from "./Workspace";
import { findForWorkspace } from "@/lib/repositories/problems";
import { notFound } from "next/navigation";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  const problemDoc = await findForWorkspace(slug);
  
  if (!problemDoc) {
    notFound();
  }

  // Serialize MongoDB ObjectIDs to strings to pass to Client Component
  const problem = JSON.parse(JSON.stringify(problemDoc));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[44rem] flex-col">
      <Workspace problem={problem} />
    </div>
  );
}
