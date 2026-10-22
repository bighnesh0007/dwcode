/**
 * Issue #20 — LinkedIn embeds in blog posts.
 *
 * renderMarkdown escapes all HTML, so a pasted LinkedIn <iframe> rendered as
 * inert text and the post looked empty. renderBlogContent rebuilds allow-listed
 * embeds and must leave every other piece of HTML escaped.
 */
import { describe, it, expect } from "vitest";
import { renderBlogContent } from "@/lib/embeds";

const SRC = "https://www.linkedin.com/embed/feed/update/urn:li:activity:7212345678901234567";
const EMBED = `<iframe src="${SRC}" height="670" width="504" frameborder="0" allowfullscreen="" title="Embedded post"></iframe>`;

describe("renderBlogContent", () => {
    it("renders a LinkedIn embed as a real iframe", () => {
        const html = renderBlogContent(EMBED);
        expect(html).toContain(`<iframe src='${SRC}' height='670'`);
        expect(html).not.toContain("&lt;iframe");
    });

    it("keeps surrounding Markdown working", () => {
        const html = renderBlogContent(`# Title\n\nSome **bold** text.\n\n${EMBED}\n\nAfter.`);
        expect(html).toContain("<h1");
        expect(html).toContain("<strong>bold</strong>");
        expect(html).toContain("<iframe src=");
        expect(html).toContain("After.");
    });

    it("drops every attribute except src and a numeric height", () => {
        const html = renderBlogContent(`<iframe src="${SRC}" height="400" onload="alert(1)" srcdoc="x"></iframe>`);
        const tag = /<iframe[^>]*>/.exec(html)?.[0] ?? "";
        expect(tag).toContain(`src='${SRC}'`);
        expect(tag).not.toContain("onload");
        expect(tag).not.toContain("srcdoc");
    });

    it("never emits live markup from a tag it cannot parse", () => {
        // The `>` inside srcdoc ends the tag early, so this is not an embed at
        // all: it must stay entirely escaped.
        const html = renderBlogContent(`<iframe src="${SRC}" srcdoc="<script>alert(1)</script>"></iframe>`);
        expect(html).not.toMatch(/<script/i);
        expect(html).not.toMatch(/<iframe[^>]*srcdoc/i);
    });

    it("leaves non-LinkedIn iframes escaped", () => {
        for (const src of [
            "https://evil.example/embed",
            "javascript:alert(1)",
            "https://www.linkedin.com.evil.example/embed/feed/update/urn:li:activity:1",
            `${SRC}' onload='alert(1)`,
        ]) {
            const html = renderBlogContent(`<iframe src="${src}"></iframe>`);
            expect(html).not.toMatch(/<iframe/i);
            expect(html).toContain("&lt;iframe");
        }
    });

    it("leaves other HTML escaped, as renderMarkdown does", () => {
        const html = renderBlogContent(`<img src=x onerror=alert(1)>\n\n${EMBED}`);
        expect(html).not.toMatch(/<img/i);
        expect(html).toContain("&lt;img");
    });

    it("cannot be tricked by text that looks like a placeholder", () => {
        const html = renderBlogContent("EMBEDabcx0 and EMBED0");
        expect(html).not.toContain("<iframe");
    });

    it("caps an absurd height", () => {
        expect(renderBlogContent(`<iframe src="${SRC}" height="99999"></iframe>`)).toContain("height='2000'");
    });
});
