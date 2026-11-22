"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

/** The certification exam's sections, for the question form. */
export function useExamSections(): { id: string; title: string }[] {
  const [sections, setSections] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    apiRequest<{ sections: { id: string; title: string }[] }>("/api/v1/certification").then((d) => setSections(d.sections)).catch(() => {});
  }, []);
  return sections;
}
