/**
 * Helpers shared by the repositories.
 *
 * lib/repositories is the only code allowed to touch Mongoose (enforced by
 * eslint.config.mjs). Route handlers call repository functions and never see a
 * query, an operator or a database error code. Replacing the database
 * (issue #23) means reimplementing these modules, not every route.
 *
 * Every repository function connects on its own; connectToDatabase is cached,
 * so repeated calls are free.
 */
import mongoose from "mongoose";

export { default as connect } from "@/lib/db";

/** A record id, as passed between repositories and routes. */
export type RecordId = string | mongoose.Types.ObjectId;

/** Whether `id` has the shape of a record id. Ids are database-specific. */
export function isValidId(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

/** True when a write failed because a unique index rejected it. */
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}
