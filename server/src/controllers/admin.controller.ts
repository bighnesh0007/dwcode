/**
 * HTTP adapter for admin.
 *
 *   GET    /api/v1/admin/users          admin   — user directory
 *   GET    /api/v1/admin/roles          super   — list admins
 *   POST   /api/v1/admin/roles          super   — grant admin
 *   DELETE /api/v1/admin/roles/:userId  super   — revoke admin
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams } from "../middleware/validate.ts";
import type { AdminService } from "../services/admin/admin.service.ts";
import { ok } from "../utils/respond.ts";
import type { GrantRoleInput } from "../validation/admin.schema.ts";

export class AdminController {
  constructor(private readonly service: AdminService) {}

  users = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.listUsers(req.isSuperAdmin === true));
  };

  roles = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.listAdmins(req.isSuperAdmin === true));
  };

  grant = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<GrantRoleInput>(req);
    await this.service.grant(callerId(req), req.isSuperAdmin === true, { userId: body.targetUserId, userName: body.targetUserName });
    ok(res, { userId: body.targetUserId, role: "admin" });
  };

  revoke = async (req: Request, res: Response): Promise<void> => {
    const { userId } = validatedParams<{ userId: string }>(req);
    await this.service.revoke(req.isSuperAdmin === true, userId);
    ok(res, { userId, revoked: true });
  };
}

function callerId(req: Request): string {
  const id = req.auth?.userId;
  if (!id) throw new UnauthenticatedError();
  return id;
}
