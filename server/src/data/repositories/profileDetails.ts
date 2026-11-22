/**
 * Profile extras — facade over mongo/profileDetails.ts and pg/profileDetails.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/profileDetails.ts";
import * as p from "./pg/profileDetails.ts";
import { pgImpl, read, write } from "./backend.ts";

export type { ProfileDetailPatch } from "./mongo/profileDetails.ts";

export const get = read("profileDetails.get", m.get, pgImpl<typeof m.get>(p.get));
export const getMany = read("profileDetails.getMany", m.getMany, pgImpl<typeof m.getMany>(p.getMany));
export const upsert = write("profileDetails.upsert", m.upsert, pgImpl<typeof m.upsert>(p.upsert));
export const listMentors = read("profileDetails.listMentors", m.listMentors, pgImpl<typeof m.listMentors>(p.listMentors));
