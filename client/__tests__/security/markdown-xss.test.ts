/**
 * Security regression — H-1: stored XSS via attribute injection in renderMarkdown.
 *
 * The renderer escaped `&`, `<` and `>` but NOT quotes, while emitting link URLs
 * into SINGLE-quoted attributes. HTML5 tokenisation recovers from a missing
 * space after a quoted attribute value, so an unescaped `'` in a URL broke out
 * of `href` and became a live event handler:
 *
 *   [x](https://e.com'onmouseover='location=name)
 *   → <a href='https://e.com'onmouseover='location=name' ...>
 *
 * Reachable from three stored sinks, all rendered with dangerouslySetInnerHTML:
 * blog posts, problem comments, and problem descriptions.
 *
 * These tests MUST fail if SEC-07 is reverted.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { renderMarkdown } from "@/lib/markdown";

/** Any `on*=` handler attribute in the output is a failure, however it got there. */
const EVENT_HANDLER = /\son\w+\s*=/i;

describe("renderMarkdown — attribute injection (H-1)", () => {
    it("neutralises the confirmed exploit payload", () => {
        const html = renderMarkdown("[click](https://e.com'onmouseover='location=name)");
        expect(html).not.toMatch(EVENT_HANDLER);
        // The quote must survive only in escaped form.
        expect(html).toContain("&#39;");
    });

    it.each([
        ["single-quote breakout", "[x](https://e.com'onmouseover='alert)"],
        ["double-quote breakout", '[x](https://e.com"onfocus="alert)'],
        ["style injection", "[x](https://e.com'style='position:fixed;inset:0)"],
        ["autofocus+onfocus", "[x](https://e.com'autofocus'onfocus='alert)"],
        ["entity-encoded handler", "[x](https://e.com'onclick='eval&#40;1&#41;)"],
    ])("blocks %s", (_label, payload) => {
        expect(renderMarkdown(payload)).not.toMatch(EVENT_HANDLER);
    });

    it("never linkifies a non-http(s) protocol", () => {
        // These are left as inert literal text rather than becoming anchors —
        // the URL pattern requires http(s) and safeHttpUrl double-checks it.
        // What matters is that no <a href> is produced, NOT that the substring
        // is absent: as escaped body text it cannot execute.
        for (const payload of [
            "[x](javascript:alert(1))",
            "[x](data:text/html,<script>alert(1)</script>)",
            "[x](vbscript:msgbox)",
            "[x](JaVaScRiPt:alert(1))",
        ]) {
            const html = renderMarkdown(payload);
            expect(html).not.toContain("<a ");
            expect(html).not.toContain("href=");
        }
    });

    it("property: every emitted href is http(s)", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 200 }), (input) => {
                const html = renderMarkdown(input);
                for (const [, href] of html.matchAll(/href='([^']*)'/g)) {
                    if (!/^https?:\/\//i.test(href)) return false;
                }
                return true;
            }),
            { numRuns: 500 },
        );
    });

    it("never emits a raw script tag for any input", () => {
        for (const payload of [
            "<script>alert(1)</script>",
            "<img src=x onerror=alert(1)>",
            "<svg/onload=alert(1)>",
            "**<script>alert(1)</script>**",
            "`<script>alert(1)</script>`",
        ]) {
            const html = renderMarkdown(payload);
            expect(html).not.toContain("<script");
            expect(html).not.toContain("<img");
            expect(html).not.toContain("<svg");
        }
    });

    it("property: no input produces an event-handler attribute", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 200 }), (input) => {
                return !EVENT_HANDLER.test(renderMarkdown(input));
            }),
            { numRuns: 500 },
        );
    });

    it("property: no input produces an unescaped quote inside an attribute", () => {
        // Every attribute the renderer emits is single-quoted, so a bare `'`
        // between the opening tag and its `>` means a breakout.
        fc.assert(
            fc.property(fc.string({ maxLength: 200 }), (input) => {
                const html = renderMarkdown(input);
                for (const tag of html.match(/<a\s[^>]*>/g) ?? []) {
                    // Strip the legitimate delimiters, then look for leftovers.
                    const attrValues = tag.match(/'[^']*'/g) ?? [];
                    const withoutValues = attrValues.reduce((acc, v) => acc.replace(v, ""), tag);
                    if (withoutValues.includes("'")) return false;
                }
                return true;
            }),
            { numRuns: 500 },
        );
    });
});

describe("renderMarkdown — formatting is preserved", () => {
    it("still renders legitimate http(s) links", () => {
        const html = renderMarkdown("[docs](https://dwcode.dev/guide)");
        expect(html).toContain("href='https://dwcode.dev/guide'");
        expect(html).toContain(">docs</a>");
        expect(html).toContain('rel=\'noopener noreferrer\'');
    });

    it("keeps query strings intact (escaped `&` is correct inside an attribute)", () => {
        const html = renderMarkdown("[q](https://x.dev/a?b=1&c=2)");
        // &amp; is the correct HTML encoding and decodes back to & in the DOM.
        expect(html).toContain("href='https://x.dev/a?b=1&amp;c=2'");
    });

    it("leaves an unusable URL as inert literal text rather than a link", () => {
        const html = renderMarkdown("[x](https://)");
        expect(html).not.toContain("<a ");
    });

    it("still renders headings, emphasis, code and blockquotes", () => {
        expect(renderMarkdown("# Title")).toContain("<h1");
        expect(renderMarkdown("## Sub")).toContain("<h2");
        expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
        expect(renderMarkdown("*em*")).toContain("<em>em</em>");
        expect(renderMarkdown("`code`")).toContain("<code");
        expect(renderMarkdown("> quote")).toContain("<blockquote");
        expect(renderMarkdown("- item")).toContain("<li");
    });

    it("escapes apostrophes in ordinary prose without mangling it", () => {
        const html = renderMarkdown("DataWeave's syntax");
        expect(html).toContain("DataWeave&#39;s syntax");
    });
});
