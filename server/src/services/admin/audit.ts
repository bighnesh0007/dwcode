/**
 * The audit log (SFCode parity, Phase F): every admin action is recorded with
 * who did it, what and to what. Recording never fails the action it
 * describes; a failure is logged instead.
 */
import { logger } from "../../lib/logger.ts";
import { OpsRepository } from "../../repositories/ops.repository.ts";

const ops = new OpsRepository();

export async function recordAudit(actorId: string, action: string, target: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await ops.audit({ actorId, action, target, detail });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), action, target }, "[audit] could not record");
  }
}
