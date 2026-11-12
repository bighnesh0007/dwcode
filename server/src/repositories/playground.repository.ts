import * as snippets from "../data/repositories/snippets.ts";

export type FileKind = "payload" | "vars" | "attributes" | "custom";
export type FileLanguage = "json" | "xml" | "csv" | "yaml" | "text" | "java" | "ndjson" | "multipart";

export interface SnippetFile {
  name: string;
  kind: FileKind;
  language: FileLanguage;
  content: string;
}

export interface SnippetTestCase {
  name: string;
  files: SnippetFile[];
  expectedOutput: string;
}

export interface NewSnippet {
  script: string;
  files: SnippetFile[];
  testCases: SnippetTestCase[];
  userId: string;
}

export interface SnippetView {
  id: string;
  script: string;
  files: SnippetFile[];
  testCases: SnippetTestCase[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class PlaygroundRepository {
  /**
   * Stores under a fresh slug from `makeSlug`, retrying on collision. Returns
   * the slug, or null when every attempt collided. DATA_BACKEND picks the database.
   */
  create(makeSlug: () => string, input: NewSnippet): Promise<string | null> {
    return snippets.createWithUniqueSlug(makeSlug, {
      script: input.script,
      files: input.files,
      testCases: input.testCases,
      userId: input.userId,
    });
  }

  async findBySlug(slug: string): Promise<SnippetView | null> {
    const row = await snippets.findBySlug(slug);
    if (!row) return null;
    const file = (f: { name: string; kind?: string | null; language?: string | null; content?: string | null }): SnippetFile => ({
      name: f.name,
      kind: (f.kind ?? "custom") as FileKind,
      language: (f.language ?? "json") as FileLanguage,
      content: f.content ?? "",
    });
    return {
      id: row.slug,
      script: row.script,
      files: row.files.map(file),
      testCases: row.testCases.map((t) => ({ name: t.name, files: t.files.map(file), expectedOutput: t.expectedOutput ?? "" })),
      ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  }
}
