/**
 * HTTP adapter for platform and admin (Phase F).
 *
 *   POST   /api/v1/telemetry/error                   public  { message, source?, stack?, url? }
 *   POST   /api/v1/telemetry/csp                     public  a CSP violation report
 *   POST   /api/v1/telemetry/pageview                public  { path }
 *   GET    /api/v1/admin/ops/analytics               admin
 *   GET    /api/v1/admin/ops/audit?before=           admin
 *   GET    /api/v1/admin/ops/moderation              admin
 *   PUT    /api/v1/admin/ops/moderation              admin   { kind, ref, reason, days? }
 *   DELETE /api/v1/admin/ops/moderation/:kind/:ref   admin
 *   GET    /api/v1/admin/ops/errors?resolved=        admin
 *   POST   /api/v1/admin/ops/errors/:fingerprint/resolve admin
 *   POST   /api/v1/admin/ops/email-test              admin   send a test email to yourself
 *   GET    /api/v1/admin/ops/store                   admin   every item with its override
 *   PUT    /api/v1/admin/ops/store                   admin   { overrides: { id: { cost?, disabled? } } }
 */
import type { Request, Response } from "express";
import { config } from "../config/index.ts";
import * as roles from "../data/repositories/roles.ts";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate.ts";
import type { ModerationKind, OpsService } from "../services/admin/ops.service.ts";
import type { IdentityProvider } from "../types/ports.ts";
import { ok } from "../utils/respond.ts";
import type { ClientErrorBody, CspReportBody, ModerateBody, StoreOverridesBody } from "../validation/ops.schema.ts";
import { SettingsRepository } from "../repositories/notification.repository.ts";

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Authentication required.");
  return userId;
}

export class OpsController {
  constructor(private readonly ops: OpsService, private readonly identity: IdentityProvider) {}

  private readonly settings = new SettingsRepository();

  storeItems = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.ops.storeItems(this.settings));
  };

  setStoreOverrides = async (req: Request, res: Response): Promise<void> => {
    const { overrides } = validatedBody<StoreOverridesBody>(req);
    const clean = Object.fromEntries(Object.entries(overrides).map(([id, o]) => [id, {
      ...(o.cost !== undefined ? { cost: o.cost } : {}),
      ...(o.disabled !== undefined ? { disabled: o.disabled } : {}),
    }]));
    ok(res, await this.ops.setStoreOverrides(requireUser(req), clean, this.settings));
  };

  emailTest = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.ops.emailTest(requireUser(req), this.identity));
  };

  clientError = async (req: Request, res: Response): Promise<void> => {
    const b = validatedBody<ClientErrorBody>(req);
    await this.ops.reportError({ kind: "error", message: b.message, source: b.source, stack: b.stack, url: b.url, userAgent: req.get("user-agent") });
    res.status(204).end();
  };

  csp = async (req: Request, res: Response): Promise<void> => {
    const r = validatedBody<CspReportBody>(req)["csp-report"];
    const directive = r["effective-directive"] ?? r["violated-directive"] ?? "unknown";
    await this.ops.reportError({ kind: "csp", message: `CSP ${directive} blocked ${r["blocked-uri"] ?? "inline"}`, source: r["document-uri"], userAgent: req.get("user-agent") });
    res.status(204).end();
  };

  pageView = async (req: Request, res: Response): Promise<void> => {
    await this.ops.pageView(validatedBody<{ path: string }>(req).path);
    res.status(204).end();
  };

  analytics = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.ops.analytics());
  };

  audit = async (req: Request, res: Response): Promise<void> => {
    const { before } = validatedQuery<{ before?: string }>(req);
    ok(res, { entries: await this.ops.auditLog(before ? new Date(before) : undefined) });
  };

  moderation = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.ops.moderation());
  };

  moderate = async (req: Request, res: Response): Promise<void> => {
    const b = validatedBody<ModerateBody>(req);
    const admins = new Set(await roles.listAdminUserIds());
    if (config.superAdminUserId) admins.add(config.superAdminUserId);
    ok(res, await this.ops.moderate(requireUser(req), b.kind, b.ref, b.reason, b.kind === "user" ? b.days : null, admins));
  };

  unmoderate = async (req: Request, res: Response): Promise<void> => {
    const { kind, ref } = validatedParams<{ kind: ModerationKind; ref: string }>(req);
    ok(res, await this.ops.unmoderate(requireUser(req), kind, ref));
  };

  errors = async (req: Request, res: Response): Promise<void> => {
    const { resolved } = validatedQuery<{ resolved: "true" | "false" }>(req);
    ok(res, { errors: await this.ops.errors(resolved === "true") });
  };

  resolveError = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.ops.resolveError(requireUser(req), validatedParams<{ fingerprint: string }>(req).fingerprint));
  };
}
