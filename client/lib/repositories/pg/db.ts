import { Types } from "mongoose";
import { createPgDatabase, type PgDatabase } from "@/db/postgres/client";

const cache = globalThis as typeof globalThis & { __dwcodePg?: PgDatabase };

/** The shared Drizzle handle, created on first use (one pool per process). */
export function db(): PgDatabase {
  cache.__dwcodePg ??= createPgDatabase();
  return cache.__dwcodePg;
}

/** Tests only: close the pool so the next `db()` reads DATABASE_URL again. */
export async function resetPgForTests() {
  const current = cache.__dwcodePg;
  cache.__dwcodePg = undefined;
  await current?.close();
}

/**
 * Postgres keeps Mongo's ids as hex text. Until the Phase 4 cutover removes
 * Mongoose, records leave the repositories in the shape callers already
 * handle, `_id` as an ObjectId included.
 */
export const oid = (hex: string) => new Types.ObjectId(hex);

/** A caller's id (string or ObjectId) as the hex text Postgres stores. */
export const hex = (id: string | Types.ObjectId) => String(id);

/** Whether `id` can be a stored id; anything else matches no row. */
export const isHexId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{24}$/i.test(id);
