/**
 * Admin roles — facade over mongo/roles.ts and pg/roles.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/roles";
import * as p from "./pg/roles";
import { pgImpl, read, write } from "./backend";

export const listAdminRoles = read("roles.listAdminRoles", m.listAdminRoles,
  pgImpl<typeof m.listAdminRoles>(p.listAdminRoles), { ignoreId: true });
export const listAdminUserIds = read("roles.listAdminUserIds", m.listAdminUserIds, p.listAdminUserIds);
export const hasAdminRole = read("roles.hasAdminRole", m.hasAdminRole, p.hasAdminRole);
export const grantAdmin = write("roles.grantAdmin", m.grantAdmin, p.grantAdmin);
export const revokeAdmin = write("roles.revokeAdmin", m.revokeAdmin, p.revokeAdmin);
