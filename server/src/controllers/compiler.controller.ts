/**
 * HTTP adapter for running a script. Validation happened in middleware; the
 * only decision here is the one that matters: whose failure is it?
 *
 *   user's result (compile error, runtime error, timeout, limit) → 200, data.ok = false
 *   ours (overloaded, unavailable)                             → 503 + Retry-After
 */
import type { Request, Response } from "express";
import { CompilerUnavailableError, NotConfiguredError } from "../errors/AppError.ts";
import { validatedBody } from "../middleware/validate.ts";
import { ok } from "../utils/respond.ts";
import {
  isInfrastructureFailure,
  type CompilerServiceClient,
} from "../services/compiler/compilerService.client.ts";
import type { RunInput } from "../validation/compiler.schema.ts";

export class CompilerController {
  constructor(private readonly service: CompilerServiceClient | undefined) {}

  /** POST /api/v1/compiler/run — auth optional; the playground works signed out. */
  run = async (req: Request, res: Response): Promise<void> => {
    if (!this.service) throw new NotConfiguredError("The compiler service");
    const body = validatedBody<RunInput>(req);
    const result = await this.service.execute({ script: body.script, inputs: body.inputs });
    if (isInfrastructureFailure(result) && !result.ok) {
      throw new CompilerUnavailableError(result.error.message, result.error.kind === "OVERLOADED" ? 1 : 5);
    }
    ok(res, result);
  };
}
