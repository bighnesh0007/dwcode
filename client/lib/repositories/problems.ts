/**
 * Problems — facade over mongo/problems.ts and pg/problems.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/problems";
import * as p from "./pg/problems";
import { pgImpl, read, write } from "./backend";

export { isValidId } from "./shared";
const preset = (doc: { _id: unknown; createdAt: Date }) => ({ id: String(doc._id), createdAt: doc.createdAt });

export const listPublic = read("problems.listPublic", m.listPublic, pgImpl<typeof m.listPublic>(p.listPublic));
export const findPublicByIdOrSlug = read("problems.findPublicByIdOrSlug", m.findPublicByIdOrSlug,
  pgImpl<typeof m.findPublicByIdOrSlug>(p.findPublicByIdOrSlug));
export const findForWorkspace = read("problems.findForWorkspace", m.findForWorkspace,
  pgImpl<typeof m.findForWorkspace>(p.findForWorkspace));
export const findForGrading = read("problems.findForGrading", m.findForGrading,
  pgImpl<typeof m.findForGrading>(p.findForGrading));
export const findSlugById = read("problems.findSlugById", m.findSlugById, p.findSlugById);
export const findIdBySlug = read("problems.findIdBySlug", m.findIdBySlug, pgImpl<typeof m.findIdBySlug>(p.findIdBySlug));
export const slugsForIds = read("problems.slugsForIds", m.slugsForIds, p.slugsForIds);
export const findByIds = read("problems.findByIds", m.findByIds, pgImpl<typeof m.findByIds>(p.findByIds));
export const summariesForSlugs = read("problems.summariesForSlugs", m.summariesForSlugs,
  pgImpl<typeof m.summariesForSlugs>(p.summariesForSlugs));
export const difficultyBySlug = read("problems.difficultyBySlug", m.difficultyBySlug, p.difficultyBySlug);
export const recentByCreator = read("problems.recentByCreator", m.recentByCreator,
  pgImpl<typeof m.recentByCreator>(p.recentByCreator));
export const listForSitemap = read("problems.listForSitemap", m.listForSitemap,
  pgImpl<typeof m.listForSitemap>(p.listForSitemap));
export const count = read("problems.count", m.count, p.count);
export const create = write("problems.create", m.create, pgImpl<typeof m.create>(p.create),
  (doc, fields) => p.create(fields, preset(doc)));
export const updateById = write("problems.updateById", m.updateById, pgImpl<typeof m.updateById>(p.updateById));
export const deleteById = write("problems.deleteById", m.deleteById, p.deleteById);
