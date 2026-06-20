import Workspace from "./Workspace";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";
import { notFound } from "next/navigation";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  await connectToDatabase();
  const problemDoc = await Problem.findOne({ slug }).lean();
  
  if (!problemDoc) {
    notFound();
  }

  // Serialize MongoDB ObjectIDs to strings to pass to Client Component
  const problem = JSON.parse(JSON.stringify(problemDoc));

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <Workspace problem={problem} />
    </div>
  );
}
