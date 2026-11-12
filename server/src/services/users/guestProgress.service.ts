/**
 * Guest-progress carryover — DISABLED (audit finding C-5).
 *
 * The Next.js route wrote an `Accepted` submission for every client-supplied
 * slug with no proof any code was run. It stays off until guest solves can be
 * re-graded server-side (FEAT-01). The server has no config flag for it, so the
 * switch is this constant; while false the endpoint answers 503 NOT_CONFIGURED,
 * which components/GuestMigration.tsx treats as retryable (localStorage kept).
 */
import { NotConfiguredError } from "../../errors/AppError.ts";

export const GUEST_MIGRATION_ENABLED = false;

export class GuestProgressService {
  migrate(): never {
    // Deliberately no write path: re-enabling must come with server-side
    // re-grading, not with the old trust-the-client loop.
    throw new NotConfiguredError("Guest progress migration");
  }
}
