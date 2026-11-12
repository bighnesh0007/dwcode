/**
 * "Is this user an admin?" for routes that are public but reveal more to
 * admins (GET /problems/:id). Same rule as middleware/auth.ts requireAdmin.
 */
import { config } from "../config/index.ts";
import { hasAdminRole } from "../data/repositories/roles.ts";

export class ProblemAccessRepository {
  async isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    if (config.superAdminUserId && userId === config.superAdminUserId) return true;
    return hasAdminRole(userId);
  }
}
