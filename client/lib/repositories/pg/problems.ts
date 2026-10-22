import { and, count as countRows, desc, eq, inArray, type SQL } from "drizzle-orm";
import { problems } from "@/db/postgres/schema";
import { isDuplicateKeyError, type RecordId } from "../shared";
import { db, hex, isHexId, oid } from "./db";

type Row = typeof problems.$inferSelect;

/** Mongo's field names for each column (only `createdByAI` differs). */
const FIELD: Record<string, keyof Row> = {
  title: "title", slug: "slug", difficulty: "difficulty", category: "category", tags: "tags",
  description: "description", examples: "examples", constraints: "constraints",
  starterCode: "starterCode", testCases: "testCases", hiddenTestCases: "hiddenTestCases",
  solution: "solution", hints: "hints", createdByAI: "createdByAi", createdBy: "createdBy",
  createdAt: "createdAt",
};

/** A row in the shape of a lean Mongo problem; `omit` drops Mongo field names. */
function toDoc(row: Row, omit: string[] = []) {
  const doc = {
    _id: oid(row.id),
    title: row.title,
    slug: row.slug,
    difficulty: row.difficulty,
    category: row.category,
    tags: row.tags,
    description: row.description,
    examples: row.examples,
    constraints: row.constraints,
    starterCode: row.starterCode,
    testCases: row.testCases,
    hiddenTestCases: row.hiddenTestCases,
    solution: row.solution ?? undefined,
    hints: row.hints,
    createdByAI: row.createdByAi,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !omit.includes(key))) as typeof doc;
}

/** Keep only the named Mongo fields (plus `_id`), like a Mongoose inclusion select. */
function pick(row: Row, fields: string[]) {
  const doc = toDoc(row) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(doc).filter(([k]) => k === "_id" || fields.includes(k)));
}

/** Mongo field names → a Drizzle insert/update object. Unknown names are dropped. */
function toColumns(fields: Record<string, unknown>): Partial<Row> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const col = FIELD[key];
    if (col && value !== undefined) out[col] = value;
  }
  return out;
}

function filterWhere(filter: { difficulty?: string; category?: string; createdByAI?: boolean }) {
  const parts: SQL[] = [];
  if (filter.difficulty !== undefined) parts.push(eq(problems.difficulty, filter.difficulty));
  if (filter.category !== undefined) parts.push(eq(problems.category, filter.category));
  if (filter.createdByAI !== undefined) parts.push(eq(problems.createdByAi, filter.createdByAI));
  return parts.length ? and(...parts) : undefined;
}

const ids = (list: RecordId[]) => list.map(hex).filter(isHexId);

export async function listPublic(filter: { difficulty?: string; category?: string }) {
  const rows = await db().select().from(problems).where(filterWhere(filter)).orderBy(desc(problems.createdAt));
  return rows.map((r) => toDoc(r, ["testCases", "hiddenTestCases", "solution"]));
}

async function findOne(where: SQL | undefined) {
  const rows = await db().select().from(problems).where(where).limit(1);
  return rows[0] ?? null;
}

const byId = (id: string) => (isHexId(id) ? findOne(eq(problems.id, id)) : Promise.resolve(null));

export async function findPublicByIdOrSlug(idOrSlug: string) {
  const row = isHexId(idOrSlug) ? await byId(idOrSlug) : await findOne(eq(problems.slug, idOrSlug));
  return row ? toDoc(row, ["hiddenTestCases", "solution"]) : null;
}

export async function findForWorkspace(slug: string) {
  const row = await findOne(eq(problems.slug, slug));
  return row ? toDoc(row, ["hiddenTestCases"]) : null;
}

export async function findForGrading(id: string) {
  const row = await byId(id);
  return row ? pick(row, ["title", "slug", "difficulty", "testCases", "examples", "hiddenTestCases"]) : null;
}

export async function findSlugById(id: string): Promise<string | null> {
  return (await byId(id))?.slug ?? null;
}

export async function findIdBySlug(slug: string) {
  const rows = await db().select({ id: problems.id }).from(problems).where(eq(problems.slug, slug)).limit(1);
  return rows[0] ? oid(rows[0].id) : null;
}

export async function slugsForIds(list: RecordId[]): Promise<string[]> {
  const wanted = ids(list);
  if (!wanted.length) return [];
  const rows = await db().select({ slug: problems.slug }).from(problems).where(inArray(problems.id, wanted));
  return rows.map((r) => r.slug);
}

export async function findByIds(list: RecordId[], limit: number) {
  const wanted = ids(list);
  if (!wanted.length) return [];
  const rows = await db().select().from(problems).where(inArray(problems.id, wanted)).limit(limit);
  return rows.map((r) => toDoc(r));
}

export async function summariesForSlugs(slugs: string[]) {
  if (!slugs.length) return [];
  const rows = await db().select().from(problems).where(inArray(problems.slug, slugs));
  return rows.map((r) => pick(r, ["title", "slug", "difficulty"]));
}

export async function difficultyBySlug(): Promise<Record<string, string>> {
  const rows = await db().select({ slug: problems.slug, difficulty: problems.difficulty }).from(problems);
  return Object.fromEntries(rows.map((r) => [r.slug, r.difficulty]));
}

export async function recentByCreator(userId: string, limit: number) {
  const rows = await db().select().from(problems).where(eq(problems.createdBy, userId))
    .orderBy(desc(problems.createdAt)).limit(limit);
  return rows.map((r) => toDoc(r));
}

export async function listForSitemap() {
  const rows = await db().select({ id: problems.id, slug: problems.slug, createdAt: problems.createdAt }).from(problems);
  return rows.map((r) => ({ _id: oid(r.id), slug: r.slug, createdAt: r.createdAt }));
}

export async function count(filter: { difficulty?: string; createdByAI?: boolean } = {}): Promise<number> {
  const [row] = await db().select({ n: countRows() }).from(problems).where(filterWhere(filter));
  return row.n;
}

/** `preset` carries Mongo's id and creation time when mirroring a write. */
export async function create(fields: Record<string, unknown>, preset?: { id: string; createdAt: Date }) {
  const values = { ...toColumns(fields), ...(preset && { id: preset.id, createdAt: preset.createdAt }) };
  const [row] = await db().insert(problems).values(values as typeof problems.$inferInsert).returning();
  return toDoc(row);
}

export async function updateById(id: string, set: Record<string, unknown>) {
  if (!isHexId(id)) return null;
  const values = toColumns(set);
  try {
    const rows = Object.keys(values).length
      ? await db().update(problems).set(values).where(eq(problems.id, id)).returning()
      : await db().select().from(problems).where(eq(problems.id, id));
    return rows[0] ? toDoc(rows[0]) : null;
  } catch (err) {
    if (isDuplicateKeyError(err)) return "duplicate" as const;
    throw err;
  }
}

/** Deleting a problem cascades to its submissions, bookmarks, notes and reports. */
export async function deleteById(id: string): Promise<boolean> {
  if (!isHexId(id)) return false;
  const rows = await db().delete(problems).where(eq(problems.id, id)).returning({ id: problems.id });
  return rows.length > 0;
}
