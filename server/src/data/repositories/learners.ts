/**
 * Learner path state — facade over mongo/learners.ts and pg/learners.ts; backend.ts picks one per call.
 */
import * as m from "./mongo/learners.ts";
import * as p from "./pg/learners.ts";
import { read, write } from "./backend.ts";

export const get = read("learners.get", m.get, p.get);
export const put = write("learners.put", m.put, p.put);
