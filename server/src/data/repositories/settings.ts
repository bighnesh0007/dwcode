/**
 * Site-wide settings — facade over mongo/settings.ts and pg/settings.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/settings.ts";
import * as p from "./pg/settings.ts";
import { read, write } from "./backend.ts";

export const get = read("settings.get", m.get, p.get);
export const set = write("settings.set", m.set, p.set);
export const claim = write("settings.claim", m.claim, p.claim);
