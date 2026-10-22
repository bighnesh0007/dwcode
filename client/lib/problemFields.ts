/**
 * The problem fields a client — or an AI model — may supply.
 *
 * Provenance (`createdBy`, `createdAt`, `createdByAI`) and identity (`_id`,
 * `slug`) are server-owned, so they are absent and anything carrying them is
 * ignored (audit finding H-5; CLAUDE.md: never spread a request body into a
 * model). `slug` is always derived from `title`.
 */
export const WRITABLE_PROBLEM_FIELDS = [
  "title",
  "difficulty",
  "category",
  "tags",
  "description",
  "examples",
  "constraints",
  "starterCode",
  "testCases",
  "hiddenTestCases",
  "solution",
  "hints",
] as const;

/** Copy only the writable fields that are present in `source`. */
export function pickWritableProblemFields(source: unknown): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  if (typeof source !== "object" || source === null) return picked;
  for (const field of WRITABLE_PROBLEM_FIELDS) {
    if (field in source) picked[field] = (source as Record<string, unknown>)[field];
  }
  return picked;
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}
