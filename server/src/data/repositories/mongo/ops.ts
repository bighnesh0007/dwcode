import { AuditEntry, ClientError, Moderation, PageView } from "../../../models/Ops.ts";
import { Submission } from "../../../models/Submission.ts";
import { UserProfile } from "../../../models/UserProfile.ts";
import { connect } from "../shared.ts";

// ── Audit log ───────────────────────────────────────────────────────────────

export interface NewAuditEntry {
  actorId: string;
  action: string;
  target: string;
  detail: unknown;
}

export async function audit(e: NewAuditEntry) {
  await connect();
  return (await AuditEntry.create(e)).toObject();
}

/** Newest first; `before` pages back. */
export async function auditLog(limit: number, before?: Date) {
  await connect();
  return AuditEntry.find(before ? { createdAt: { $lt: before } } : {}).sort({ createdAt: -1 }).limit(limit).lean();
}

// ── Moderation ──────────────────────────────────────────────────────────────

export interface ModerationInput {
  reason: string;
  actorId: string;
  until: Date | null;
}

const MOD_FIELDS = "kind ref reason actorId until createdAt -_id";

export async function moderate(kind: string, ref: string, m: ModerationInput) {
  await connect();
  return Moderation.findOneAndUpdate(
    { kind, ref },
    { $set: { ...m, createdAt: new Date() }, $setOnInsert: { kind, ref } },
    { upsert: true, returnDocument: "after", projection: MOD_FIELDS },
  ).lean();
}

export async function unmoderate(kind: string, ref: string): Promise<boolean> {
  await connect();
  return (await Moderation.deleteOne({ kind, ref })).deletedCount > 0;
}

/** Active entries of a kind (suspensions past their end are not). */
export async function moderated(kind: string, now: Date) {
  await connect();
  return Moderation.find({ kind, $or: [{ until: null }, { until: { $gt: now } }] }).select(MOD_FIELDS).sort({ createdAt: -1 }).lean();
}

// ── Telemetry ───────────────────────────────────────────────────────────────

export interface ClientErrorEvent {
  fingerprint: string;
  kind: string;
  message: string;
  source: string;
  sample: Record<string, string>;
}

/** Count one occurrence; a resolved error that happens again is reopened. */
export async function recordError(e: ClientErrorEvent, at: Date): Promise<void> {
  await connect();
  await ClientError.updateOne(
    { fingerprint: e.fingerprint },
    {
      $inc: { count: 1 },
      $set: { lastSeen: at, resolved: false, sample: e.sample },
      $setOnInsert: { fingerprint: e.fingerprint, kind: e.kind, message: e.message, source: e.source, firstSeen: at },
    },
    { upsert: true },
  );
}

const ERR_FIELDS = "fingerprint kind message source sample count resolved firstSeen lastSeen -_id";

export async function listErrors(resolved: boolean, limit: number) {
  await connect();
  return ClientError.find({ resolved }).select(ERR_FIELDS).sort({ lastSeen: -1 }).limit(limit).lean();
}

export async function resolveError(fingerprint: string): Promise<boolean> {
  await connect();
  return (await ClientError.updateOne({ fingerprint }, { $set: { resolved: true } })).matchedCount > 0;
}

export async function countOpenErrors(): Promise<number> {
  await connect();
  return ClientError.countDocuments({ resolved: false });
}

export async function recordPageView(day: string, path: string): Promise<void> {
  await connect();
  await PageView.updateOne({ day, path }, { $inc: { count: 1 } }, { upsert: true });
}

/** Views since `day` (inclusive), by day and path. */
export async function pageViewsSince(day: string) {
  await connect();
  const rows = await PageView.find({ day: { $gte: day } }).select("day path count -_id").sort({ day: 1, path: 1 }).lean();
  return rows.map((r) => ({ day: r.day, path: r.path, count: r.count }));
}

// ── Analytics ───────────────────────────────────────────────────────────────

export async function userCounts(since: Date): Promise<{ total: number; recent: number }> {
  await connect();
  const [total, recent] = await Promise.all([UserProfile.countDocuments({}), UserProfile.countDocuments({ createdAt: { $gte: since } })]);
  return { total, recent };
}

/** Submissions and Accepted per UTC day since `since`. */
export async function submissionsByDay(since: Date) {
  await connect();
  const rows = await Submission.aggregate<{ _id: string; total: number; accepted: number }>([
    { $match: { createdAt: { $gte: since } } },
    { $group: {
      _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
      total: { $sum: 1 },
      accepted: { $sum: { $cond: [{ $eq: ["$status", "Accepted"] }, 1, 0] } },
    } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ day: r._id, total: r.total, accepted: r.accepted }));
}
