import type { InferRawDocTypeFromSchema } from "mongoose";

// ─── MIME / language support ──────────────────────────────────────────────────

/** Maps a PlaygroundFileLanguage to the DataWeave MIME type sent to the backend */
export const LANGUAGE_MIME: Record<PlaygroundFileLanguage, string> = {
  json: "application/json",
  xml: "application/xml",
  csv: "application/csv",
  yaml: "application/yaml",
  text: "text/plain",
  java: "application/java",
  ndjson: "application/x-ndjson",
  multipart: "multipart/form-data",
};

/** Human-readable label shown in the MIME type picker */
export const LANGUAGE_LABEL: Record<PlaygroundFileLanguage, string> = {
  json: "JSON",
  xml: "XML",
  csv: "CSV",
  yaml: "YAML",
  text: "Plain Text",
  java: "Java / Object",
  ndjson: "NDJSON",
  multipart: "Multipart",
};

/** All supported output MIME types (the `output` directive) */
export const OUTPUT_MIMES = [
  { value: "application/json", label: "JSON" },
  { value: "application/xml", label: "XML" },
  { value: "application/csv", label: "CSV" },
  { value: "application/yaml", label: "YAML" },
  { value: "text/plain", label: "Plain Text" },
  { value: "application/java", label: "Java / Object" },
  { value: "application/x-ndjson", label: "NDJSON" },
  { value: "application/dw", label: "DataWeave" },
] as const;

// ─── Files ────────────────────────────────────────────────────────────────────

type StoredSnippet = InferRawDocTypeFromSchema<
  typeof import("@/models/PlaygroundSnippet").PlaygroundSnippetSchema
>;
type StoredFile = StoredSnippet["files"][number];
type StoredTestCase = StoredSnippet["testCases"][number];

export type PlaygroundFileLanguage = StoredFile["language"];

export type PlaygroundFileKind = StoredFile["kind"];

export type PlaygroundFile = StoredFile & {
  id: string;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

export type PlaygroundTestResult = {
  status: "success" | "error";
  output: string;
  time: string | null;
};

export type PlaygroundTestCase = Omit<StoredTestCase, "files"> & {
  id: string;
  files: PlaygroundFile[];
  result?: PlaygroundTestResult;
};

// ─── Execution history ───────────────────────────────────────────────────────

export type ExecutionHistoryEntry = {
  id: string;
  timestamp: number;   // Date.now()
  script: string;
  files: PlaygroundFile[];
  output: string;
  status: "success" | "error";
  time: string;
};

// ─── Saved snippets (local) ───────────────────────────────────────────────────

export type SavedSnippet = {
  id: string;
  name: string;
  savedAt: number;
  script: string;
  files: PlaygroundFile[];
};

// ─── Sample data library ─────────────────────────────────────────────────────

export type SampleEntry = {
  id: string;
  label: string;
  language: PlaygroundFileLanguage;
  content: string;
  description: string;
};
