/**
 * CJS/ESM default-import interop.
 *
 * WHY THIS EXISTS
 *
 * `helmet` and `express-rate-limit` each ship two declaration files — `index.d.cts`
 * (CJS) and `index.d.mts` (ESM) — and both declare the factory as `export { x as
 * default }`. Which file a resolver picks is not stable across environments:
 *
 *   - helmet's `exports` map is `{ "import": "./index.mjs", "require": "./index.cjs" }`
 *     with NO `types` condition, so a resolver may fall back to the package-root
 *     `"types": "./index.d.cts"` — the CJS declaration.
 *   - When an ESM file imports a CJS module, the default binding is the WHOLE
 *     `module.exports` object, not `module.exports.default`. So under the CJS
 *     declaration the default import types as the module namespace, and calling it
 *     fails with "This expression is not callable ... has no call signatures".
 *
 * This bit us in CI/Vercel while passing locally on the same TypeScript version,
 * purely because the two environments resolved different declaration files.
 *
 * Rather than depend on that coin flip, normalise the shape once here and state the
 * factory type explicitly at each call site. `mod` is deliberately `unknown` so the
 * helper compiles no matter which declaration the resolver chose.
 */
export function interopDefault<T>(mod: unknown): T {
  if (typeof mod === "function") return mod as T;

  if (typeof mod === "object" && mod !== null && "default" in mod) {
    // `in` already narrows `mod`, so no assertion is needed to read `.default`.
    const inner: unknown = mod.default;
    if (typeof inner === "function") return inner as T;
  }

  // Neither shape matched — return as-is so the failure surfaces at the call site
  // rather than being masked by a silent undefined.
  return mod as T;
}
