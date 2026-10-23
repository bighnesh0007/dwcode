/**
 * Playground share links. Ported from client/app/api/playground/share/route.ts.
 * Sizes are enforced by the zod schema (LIMITS.playground); this layer only
 * normalises names and mints the id.
 */
import { randomBytes } from "node:crypto";
import { InternalError, NotFoundError } from "../../errors/AppError.ts";
import type {
  PlaygroundRepository,
  SnippetFile,
  SnippetTestCase,
  SnippetView,
} from "../../repositories/playground.repository.ts";
import type { ShareFileInput, ShareInput } from "../../validation/playground.schema.ts";

/** 128 random bits — the link is the only access control, so it must be unguessable. */
export function newShareId(): string {
  return randomBytes(16).toString("base64url");
}

function normalizeFile(file: ShareFileInput, fallbackName: string): SnippetFile {
  const name = file.name?.trim() ? file.name.trim().slice(0, 80) : fallbackName;
  return { name, kind: file.kind ?? "custom", language: file.language ?? "json", content: file.content ?? "" };
}

export class PlaygroundShareService {
  constructor(
    private readonly repo: PlaygroundRepository,
    private readonly makeId: () => string = newShareId,
  ) {}

  async create(input: ShareInput, userId: string | undefined): Promise<string> {
    const files = input.files.map((f, i) => normalizeFile(f, `input-${i + 1}.json`));
    const testCases: SnippetTestCase[] = input.testCases.map((t, i) => ({
      name: t.name?.trim() ? t.name.trim().slice(0, 80) : `Test ${i + 1}`,
      files: t.files ? t.files.map((f, fi) => normalizeFile(f, `input-${fi + 1}.json`)) : files,
      expectedOutput: t.expectedOutput ?? "",
    }));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.repo.create({ slug: this.makeId(), script: input.script, files, testCases, userId: userId ?? "" });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    throw new InternalError("Could not create share link.");
  }

  async load(id: string): Promise<SnippetView> {
    const snippet = await this.repo.findBySlug(id);
    if (!snippet) throw new NotFoundError("Snippet not found.");
    return snippet;
  }
}
