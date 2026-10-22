import { Problem } from "@/models/Problem";
import { connect, isDuplicateKeyError, isValidId, type RecordId } from "./shared";

export { isValidId };

/** Fields a user can never see before solving: the grader's answers. */
const PRIVATE_FIELDS = "-hiddenTestCases -solution";

/** The problem list: no test cases, hidden cases or solution. Newest first. */
export async function listPublic(filter: { difficulty?: string; category?: string }) {
  await connect();
  return Problem.find(filter)
    .select("-testCases -hiddenTestCases -solution")
    .sort({ createdAt: -1 })
    .lean();
}

/** One problem by id or slug, without hidden cases or solution. */
export async function findPublicByIdOrSlug(idOrSlug: string) {
  await connect();
  const query = isValidId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  return Problem.findOne(query).select(PRIVATE_FIELDS).lean();
}

/**
 * What the problem workspace page needs. The solution is included (the page
 * has a Reveal Solution toggle); hidden test cases are NOT — the page is
 * serialised to the browser, and shipping them would let anyone read the
 * expected outputs that grading keeps secret.
 */
export async function findForWorkspace(slug: string) {
  await connect();
  return Problem.findOne({ slug }).select("-hiddenTestCases").lean();
}

/** What grading needs, read from the database rather than the request. */
export async function findForGrading(id: string) {
  await connect();
  return Problem.findById(id)
    .select("title slug difficulty testCases examples hiddenTestCases")
    .lean();
}

export async function findSlugById(id: string): Promise<string | null> {
  await connect();
  const doc = await Problem.findById(id).select("slug").lean();
  return doc?.slug ?? null;
}

export async function findIdBySlug(slug: string) {
  await connect();
  const doc = await Problem.findOne({ slug }).select("_id").lean();
  return doc?._id ?? null;
}

/** Slugs for the given ids, in no particular order. */
export async function slugsForIds(ids: RecordId[]): Promise<string[]> {
  await connect();
  const rows = await Problem.find({ _id: { $in: ids } }).select("slug").lean();
  return rows.map((row) => row.slug);
}

export async function findByIds(ids: RecordId[], limit: number) {
  await connect();
  return Problem.find({ _id: { $in: ids } }).limit(limit).lean();
}

/** Title, slug and difficulty of the given problems. */
export async function summariesForSlugs(slugs: string[]) {
  await connect();
  return Problem.find({ slug: { $in: slugs } }).select("title slug difficulty").lean();
}

/** slug → difficulty for every problem. */
export async function difficultyBySlug(): Promise<Record<string, string>> {
  await connect();
  const rows = await Problem.find().select("slug difficulty").lean();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.slug] = row.difficulty;
  return map;
}

export async function recentByCreator(userId: string, limit: number) {
  await connect();
  return Problem.find({ createdBy: userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function listForSitemap() {
  await connect();
  return Problem.find({}).select("slug createdAt").lean();
}

export async function count(filter: { difficulty?: string; createdByAI?: boolean } = {}): Promise<number> {
  await connect();
  return Problem.countDocuments(filter);
}

/**
 * Insert a problem. Callers pass explicit fields — never a raw request body
 * (CLAUDE.md: no mass assignment). Throws on validation errors.
 */
export async function create(fields: Record<string, unknown>) {
  await connect();
  const doc = await Problem.create(fields);
  return doc.toObject();
}

/**
 * Apply `$set` to a problem. Returns the updated document, null when it does
 * not exist, or "duplicate" when the change collides with another problem's slug.
 */
export async function updateById(id: string, set: Record<string, unknown>) {
  await connect();
  try {
    return await Problem.findByIdAndUpdate(
      id,
      { $set: set },
      { returnDocument: "after", runValidators: true },
    ).lean();
  } catch (err) {
    if (isDuplicateKeyError(err)) return "duplicate" as const;
    throw err;
  }
}

/** Returns false when there was nothing to delete. */
export async function deleteById(id: string): Promise<boolean> {
  await connect();
  return Boolean(await Problem.findByIdAndDelete(id));
}
