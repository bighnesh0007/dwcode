/**
 * FROZEN legacy controller.
 *
 * Deliberately does NOT import the `ok()`/`created()` envelope helpers: these three
 * endpoints must keep their original bodies so that `dwlbackend.onrender.com` can be
 * redeployed from this codebase without breaking the live Next.js client.
 */
import type { Request, Response } from "express";
import { logEvent } from "../../lib/logger.ts";
import type { DataWeaveClient } from "../../services/dataweave/dataweave.client.ts";
import {
  normalizeLegacyInputs,
  normalizeLegacyScript,
} from "../../services/dataweave/legacy.mapper.ts";
import type { UpstreamHealthService } from "../../services/dataweave/upstreamHealth.service.ts";

export class LegacyTransformController {
  constructor(
    private readonly dw: DataWeaveClient,
    private readonly health: UpstreamHealthService,
  ) {}

  /** POST /api/transform — success is `200 { output }`, every failure is `400 { error }`. */
  transform = async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as { script?: unknown; inputs?: unknown };
    const script = normalizeLegacyScript(body.script);
    const inputs = normalizeLegacyInputs(body.inputs, req.log);

    logEvent("legacy.transform.called", {
      origin: req.get("origin") ?? null,
      userAgent: req.get("user-agent") ?? null,
      inputCount: inputs.length,
    });

    // Additive headers: they let us measure remaining legacy callers without
    // altering the body. Safe for existing clients, which ignore them.
    res.set("Deprecation", 'version="legacy"');
    res.set("Link", '</api/v1/dataweave/transform>; rel="successor-version"');

    // Any throw is turned into `400 { error }` by legacyErrorHandler.
    const output = await this.dw.execute(script, inputs);

    // Exactly one key, value unwrapped and possibly non-string.
    res.json({ output });
  };

  /**
   * GET /healthcheck
   *
   * Reproduces the original key-collision ON PURPOSE. `...result` is spread AFTER
   * `status`, and `result.status` is the numeric upstream HTTP status — so the
   * response's `status` field is a NUMBER (or 0), never the string "ok".
   * Uptime monitors parsing this depend on the number.
   */
  healthcheck = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.health.checkUpstream();

    // Written with Object.assign rather than a spread purely so TypeScript does not
    // reject the duplicate `status` key (TS2783). Runtime output is IDENTICAL: an
    // overwritten key keeps its original position, so the key order stays
    // ["status", "upstream", "ok", "durationMs", ...("error")] and `status` ends up
    // numeric. Locked by tests/integration/legacy-transform.contract.test.ts.
    const body: Record<string, unknown> = {
      status: result.ok ? "ok" : "degraded",
      upstream: this.health.url,
    };
    Object.assign(body, result);

    res.status(result.ok ? 200 : 503).json(body);
  };
}
