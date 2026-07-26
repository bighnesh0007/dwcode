/**
 * Display formatting for DataWeave payloads.
 *
 * WHY
 * Problem examples, test cases and stored submission output are free-text
 * strings — written by hand in the admin form, or emitted by the AI generator.
 * They are almost always compact JSON like `[{"id":1,"name":"alice"}]`, and the
 * UI rendered them raw and inline after a label, which produced one long
 * unreadable line on every problem page.
 *
 * TWO RULES, both important:
 *
 *  1. **Display only.** Nothing here touches stored data or grading. Verdicts are
 *     decided by `normalizeOutput` in lib/grading.ts, which does its own
 *     canonicalisation. Formatting must never influence whether an answer is
 *     correct.
 *
 *  2. **Never lose content.** If a value cannot be parsed — malformed JSON, a
 *     half-typed payload, XML we do not recognise — return it EXACTLY as given.
 *     An unreadable example is bad; a silently truncated or mangled one is worse.
 */

export type PayloadHint = "json" | "xml" | "csv" | "yaml" | "text";

/** Longest input we will attempt to reformat. Beyond this, return as-is. */
const MAX_FORMAT_LENGTH = 200_000;

/** Indent width, matching the compiler's own output style. */
const INDENT = "  ";

function looksLikeJson(trimmed: string): boolean {
    const first = trimmed[0];
    return first === "{" || first === "[";
}

function looksLikeXml(trimmed: string): boolean {
    return trimmed.startsWith("<");
}

/** Pretty-print JSON. Returns null when the value is not valid JSON. */
function formatJson(trimmed: string): string | null {
    try {
        const parsed: unknown = JSON.parse(trimmed);
        // A bare scalar ("5", "true", a quoted string) round-trips to itself and
        // gains nothing from reformatting — leave those to the caller's fallback.
        if (parsed === null || typeof parsed !== "object") return null;
        return JSON.stringify(parsed, null, 2);
    } catch {
        return null;
    }
}

/**
 * Indent XML by tag depth.
 *
 * Deliberately simple: split on tag boundaries and re-indent. It does not parse
 * XML, so it makes no claim to correctness on exotic input — which is why every
 * path that cannot be handled confidently returns the original string. Content
 * inside a tag is never modified, so text and CDATA survive untouched.
 */
function formatXml(trimmed: string): string | null {
    // Anything with a mixed text/element body is too risky to re-indent blindly.
    if (!/^<[\s\S]*>$/.test(trimmed)) return null;

    const withBreaks = trimmed.replace(/>\s*</g, ">\n<");
    const lines = withBreaks.split("\n");
    if (lines.length === 1) return null; // single tag — nothing to indent

    let depth = 0;
    const out: string[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const isClosing = line.startsWith("</");
        const isSelfContained = /^<([\w:.-]+)(\s[^>]*)?>.*<\/\1>$/.test(line);
        const isSelfClosing = line.endsWith("/>");
        const isDeclaration = line.startsWith("<?") || line.startsWith("<!");

        if (isClosing) depth = Math.max(0, depth - 1);
        out.push(INDENT.repeat(depth) + line);
        if (!isClosing && !isSelfClosing && !isDeclaration && !isSelfContained) depth += 1;
    }

    return out.join("\n");
}

/**
 * Format a payload for display.
 *
 * @param raw   the stored string
 * @param hint  optional format hint; when omitted the shape is sniffed
 * @returns a formatted string, or `raw` unchanged when it cannot be formatted
 */
export function formatPayload(raw: unknown, hint?: PayloadHint): string {
    if (typeof raw !== "string") {
        // Defensive: some callers hold `unknown` from an API response.
        if (raw === null || raw === undefined) return "";
        if (typeof raw === "object") {
            try {
                return JSON.stringify(raw, null, 2);
            } catch {
                // Circular structure. `String(value)` would render the useless
                // "[object Object]", so say what actually happened instead.
                return "[unserialisable value]";
            }
        }
        // Only primitives that stringify meaningfully. `symbol` and `function`
        // fall through to the marker rather than rendering "[object …]" noise.
        if (typeof raw === "number" || typeof raw === "boolean" || typeof raw === "bigint") {
            return String(raw);
        }
        return "[unserialisable value]";
    }

    if (raw.length > MAX_FORMAT_LENGTH) return raw;

    const trimmed = raw.trim();
    if (!trimmed) return raw;

    // CSV, YAML and plain text are already line-oriented — reformatting them
    // would only risk corrupting significant whitespace.
    if (hint === "csv" || hint === "yaml" || hint === "text") return raw;

    if (hint === "json" || (!hint && looksLikeJson(trimmed))) {
        return formatJson(trimmed) ?? raw;
    }

    if (hint === "xml" || (!hint && looksLikeXml(trimmed))) {
        return formatXml(trimmed) ?? raw;
    }

    return raw;
}

/**
 * True when formatting would visibly change the value — lets the UI show a
 * "formatted" affordance only where it means something.
 */
export function isFormattable(raw: unknown, hint?: PayloadHint): boolean {
    return typeof raw === "string" && formatPayload(raw, hint) !== raw;
}
