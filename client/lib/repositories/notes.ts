/**
 * Per-user problem notes — facade over mongo/notes.ts and pg/notes.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/notes";
import * as p from "./pg/notes";
import { pgImpl, read, write } from "./backend";

export const findOwn = read("notes.findOwn", m.findOwn, pgImpl<typeof m.findOwn>(p.findOwn), { ignoreId: true });
export const saveOwn = write("notes.saveOwn", m.saveOwn, pgImpl<typeof m.saveOwn>(p.saveOwn));
