/**
 * Make compiler errors about missing functions understandable (issue #8).
 *
 * The compiler behind DWCode runs the open-source DataWeave runtime, which
 * leaves out a few functions that the Mule runtime ships — `then` is the known
 * case. Calling one fails with a bare "Unable to resolve reference of then.",
 * which reads like a bug in the user's code. This appends a hint saying why,
 * and what to try. The original compiler message is always kept, unchanged,
 * at the top.
 */

/** Functions known to be missing from the engine the compiler runs. */
const KNOWN_UNSUPPORTED: Readonly<Record<string, string>> = {
  then:
    "`then` is not available in the DataWeave engine this site runs. " +
    "Bind the value instead, e.g. `do { var v = <expr> --- f(v) }`, or call a local `fun`.",
};

const UNRESOLVED = /Unable to resolve reference of ([A-Za-z_][\w:]*)/;

export function explainCompilerError(message: string): string {
  const match = UNRESOLVED.exec(message);
  if (!match) return message;

  const name = match[1];
  const known = KNOWN_UNSUPPORTED[name];
  const hint = known
    ? `Hint: ${known}`
    : `Hint: \`${name}\` is not defined. Check the spelling and that its module is imported ` +
      "(e.g. `import * from dw::core::Strings`). A few functions from the Mule runtime are " +
      "also missing from the open-source engine this site runs.";
  return `${message}\n\n${hint}`;
}
