/**
 * Teams — facade over mongo/teams.ts and pg/teams.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/teams.ts";
import * as p from "./pg/teams.ts";
import { pgImpl, read, write } from "./backend.ts";

export type { NewTeam } from "./mongo/teams.ts";

export const create = write("teams.create", m.create, pgImpl<typeof m.create>(p.create),
  async (doc, t) => {
    if (doc !== "duplicate") await p.create(t, { id: String(doc._id), createdAt: doc.createdAt });
  });
export const findBySlug = read("teams.findBySlug", m.findBySlug, pgImpl<typeof m.findBySlug>(p.findBySlug));
export const findByInviteCode = read("teams.findByInviteCode", m.findByInviteCode, pgImpl<typeof m.findByInviteCode>(p.findByInviteCode));
export const findForMember = read("teams.findForMember", m.findForMember, pgImpl<typeof m.findForMember>(p.findForMember));
export const listListed = read("teams.listListed", m.listListed, pgImpl<typeof m.listListed>(p.listListed));
export const memberships = read("teams.memberships", m.memberships, p.memberships);
export const addMember = write("teams.addMember", m.addMember, p.addMember,
  async (outcome, slug, userId, max) => {
    if (outcome === "joined") await p.addMember(slug, userId, max);
  });
export const removeMember = write("teams.removeMember", m.removeMember, p.removeMember);
export const setListed = write("teams.setListed", m.setListed, p.setListed);
export const deleteBySlug = write("teams.deleteBySlug", m.deleteBySlug, p.deleteBySlug);
