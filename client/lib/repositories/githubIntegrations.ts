/**
 * GitHub connections — facade over mongo/githubIntegrations.ts and pg/githubIntegrations.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/githubIntegrations";
import * as p from "./pg/githubIntegrations";
import { pgImpl, read, write } from "./backend";

export const findByUserId = read("githubIntegrations.findByUserId", m.findByUserId,
  pgImpl<typeof m.findByUserId>(p.findByUserId), { ignoreId: true });
export const findSettings = read("githubIntegrations.findSettings", m.findSettings,
  pgImpl<typeof m.findSettings>(p.findSettings), { ignoreId: true });
export const saveConnection = write("githubIntegrations.saveConnection", m.saveConnection, p.saveConnection);
export const deleteByUserId = write("githubIntegrations.deleteByUserId", m.deleteByUserId, p.deleteByUserId);
