import { and, desc, eq } from "drizzle-orm";
import { problemReports, problems } from "@/db/postgres/schema";
import type { ReportReason, ReportStatus } from "@/lib/reports";
import { isDuplicateKeyError } from "../shared";
import { db, isHexId, oid } from "./db";

type Row = typeof problemReports.$inferSelect;

const toDoc = (row: Row, problemSlug: string) => ({
  _id: oid(row.id),
  problemId: oid(row.problemId),
  problemSlug,
  userId: row.userId,
  userName: row.userName,
  reason: row.reason,
  details: row.details,
  status: row.status,
  resolvedBy: row.resolvedBy,
  resolvedAt: row.resolvedAt ?? undefined,
  resolutionNote: row.resolutionNote,
  createdAt: row.createdAt,
});

const joined = () => db().select({ r: problemReports, slug: problems.slug }).from(problemReports)
  .innerJoin(problems, eq(problems.id, problemReports.problemId));

export async function listByStatus(status: ReportStatus, limit: number) {
  const rows = await joined().where(eq(problemReports.status, status))
    .orderBy(desc(problemReports.createdAt)).limit(limit);
  return rows.map(({ r, slug }) => toDoc(r, slug));
}

export async function findOwnOpen(userId: string, problemId: string) {
  if (!isHexId(problemId)) return null;
  const rows = await db().select({
    id: problemReports.id, reason: problemReports.reason, details: problemReports.details,
    status: problemReports.status, createdAt: problemReports.createdAt,
  }).from(problemReports).where(and(
    eq(problemReports.problemId, problemId), eq(problemReports.userId, userId), eq(problemReports.status, "open"),
  )).limit(1);
  if (!rows[0]) return null;
  const { id, ...rest } = rows[0];
  return { _id: oid(id), ...rest };
}

export async function create(
  report: {
    problemId: string;
    problemSlug: string;
    userId: string;
    userName: string;
    reason: ReportReason;
    details: string;
  },
  preset?: { id: string; createdAt: Date },
) {
  const { problemSlug, ...rest } = report;
  try {
    const [row] = await db().insert(problemReports).values({
      ...rest, status: "open", ...(preset && { id: preset.id, createdAt: preset.createdAt }),
    }).returning();
    return toDoc(row, problemSlug);
  } catch (err) {
    if (isDuplicateKeyError(err)) return "duplicate" as const;
    throw err;
  }
}

const UPDATABLE = ["status", "resolvedBy", "resolvedAt", "resolutionNote", "details", "reason"] as const;

export async function updateById(id: string, set: Record<string, unknown>) {
  if (!isHexId(id)) return null;
  const values = Object.fromEntries(
    Object.entries(set).filter(([k, v]) => (UPDATABLE as readonly string[]).includes(k) && v !== undefined),
  ) as Partial<Row>;
  if (Object.keys(values).length) {
    await db().update(problemReports).set(values).where(eq(problemReports.id, id));
  }
  const rows = await joined().where(eq(problemReports.id, id));
  return rows[0] ? toDoc(rows[0].r, rows[0].slug) : null;
}
