/**
 * Helpers shared by the repositories.
 *
 * lib/repositories is the only code allowed to touch a database (enforced by
 * eslint.config.mjs). Each module here is a facade over two implementations,
 * mongo/ (Mongoose) and pg/ (Drizzle); backend.ts picks one per call. Route handlers call repository functions and never see a
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

/**
 * True when a write failed because a unique index rejected it: Mongo's 11000,
 * or Postgres's 23505 (which Drizzle wraps, so its `cause` is checked too).
 */
export function isDuplicateKeyError(err: unknown): boolean {
  for (let e = err, depth = 0; typeof e === "object" && e !== null && depth < 3; depth++) {
    const code = (e as { code?: unknown }).code;
    if (code === 11000 || code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
