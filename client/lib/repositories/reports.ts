/**
 * Problem reports — facade over mongo/reports.ts and pg/reports.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/reports";
import * as p from "./pg/reports";
import { pgImpl, read, write } from "./backend";

export const listByStatus = read("reports.listByStatus", m.listByStatus, pgImpl<typeof m.listByStatus>(p.listByStatus));
export const findOwnOpen = read("reports.findOwnOpen", m.findOwnOpen, pgImpl<typeof m.findOwnOpen>(p.findOwnOpen));
export const create = write("reports.create", m.create, pgImpl<typeof m.create>(p.create),
  async (doc, report) => {
    if (doc !== "duplicate") await p.create(report, { id: String(doc._id), createdAt: doc.createdAt });
  });
export const updateById = write("reports.updateById", m.updateById, pgImpl<typeof m.updateById>(p.updateById));
