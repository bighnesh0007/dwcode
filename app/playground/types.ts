// ─── MIME / language support ──────────────────────────────────────────────────

/** All editor languages the playground supports */
export type PlaygroundFileLanguage =
  | "json"
  | "xml"
  | "csv"
  | "yaml"
  | "text"
  | "java"
  | "ndjson"   // newline-delimited JSON
  | "multipart";

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

export type PlaygroundFileKind = "payload" | "vars" | "attributes" | "custom";

export type PlaygroundFile = {
  id: string;
  name: string;
  kind: PlaygroundFileKind;
  language: PlaygroundFileLanguage;
  content: string;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

export type PlaygroundTestResult = {
  status: "success" | "error";
  output: string;
  time: string | null;
};

export type PlaygroundTestCase = {
  id: string;
  name: string;
  files: PlaygroundFile[];
  expectedOutput?: string;
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
