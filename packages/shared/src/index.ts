/**
 * @dwcode/shared — domain constants and rules used by BOTH `client/` and
 * `server/`.
 *
 * Why this package exists: before it, `difficulty` was hardcoded in 17 files
 * with four independently-maintained copies of the scoring tables. Adding a
 * single difficulty tier meant 17 edits and permanent hand-syncing. See
 * docs/audit/03-backlog.md (REF-01).
 *
 * WHAT BELONGS HERE
 *   Pure domain rules and types with no runtime dependencies — no Mongoose, no
 *   React, no Express, no environment access. Anything importable from both a
 *   browser bundle and a Node server.
 *
 * WHAT DOES NOT
 *   Database models, HTTP handling, and anything reading `process.env`. Config
 *   stays in each package's own validated config module.
 */
export * from "./difficulty.js";
export * from "./scoring.js";
export * from "./limits.js";
