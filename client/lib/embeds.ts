// Blog post rendering with allow-listed embeds (issue #20).
//
// renderMarkdown escapes ALL HTML, which is what keeps posts XSS-safe. Blog
// posts, though, are often a pasted LinkedIn embed `<iframe>`, and once escaped
// that shows up as inert text, so the post appeared empty. The page's old
// `wrapIframes` looked for a literal `<iframe` that escaping had already removed.
//
// So recognised embeds are lifted out BEFORE escaping and rebuilt from scratch
// after it. Nothing from the author's tag survives except a src that matches
// the allow-list exactly and a numeric height. Any other HTML stays escaped.

import { renderMarkdown } from "@/lib/markdown";

/** LinkedIn's embed URLs: https://www.linkedin.com/embed/feed/update/urn:li:<kind>:<digits> */
const LINKEDIN_EMBED_SRC =
    /^https:\/\/www\.linkedin\.com\/embed\/feed\/update\/urn:li:(?:activity|share|ugcPost):\d+(?:\?compact=1)?$/;

const IFRAME_TAG = /<iframe\b([^>]*)>\s*<\/iframe>/gi;
const DEFAULT_HEIGHT = 600;
const MAX_HEIGHT = 2000;

function attr(attrs: string, name: string): string | null {
    const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs);
    return match ? (match[1] ?? match[2]) : null;
}

function embedHtml(src: string, height: number): string {
    return (
        "<div class='relative w-full overflow-hidden rounded-lg my-4' style='max-width:552px;margin-inline:auto'>" +
        `<iframe src='${src}' height='${height}' style='width:100%;border:none;' ` +
        "title='Embedded LinkedIn post' loading='lazy' allowfullscreen " +
        "sandbox='allow-scripts allow-same-origin allow-popups'></iframe></div>"
    );
}

/**
 * Render a blog post: Markdown, plus LinkedIn embeds. Returns inner HTML ready
 * for `dangerouslySetInnerHTML`. Iframes that are not LinkedIn embeds stay
 * escaped text, exactly as renderMarkdown alone would leave them.
 */
export function renderBlogContent(content: string): string {
    const embeds: string[] = [];
    // A per-call nonce, so text in the post cannot forge a placeholder.
    const nonce = Math.random().toString(36).slice(2);

    const lifted = content.replace(IFRAME_TAG, (tag, attrs: string) => {
        const src = attr(attrs, "src");
        if (!src || !LINKEDIN_EMBED_SRC.test(src)) return tag;
        const rawHeight = Number.parseInt(attr(attrs, "height") ?? "", 10);
        const height = Number.isFinite(rawHeight) && rawHeight > 0 ? Math.min(rawHeight, MAX_HEIGHT) : DEFAULT_HEIGHT;
        embeds.push(embedHtml(src, height));
        // Own paragraph, so Markdown's line handling never splits it.
        return `\n\nEMBED${nonce}x${embeds.length - 1}\n\n`;
    });

    return renderMarkdown(lifted).replace(
        new RegExp(`EMBED${nonce}x(\\d+)`, "g"),
        (_, i: string) => embeds[Number(i)] ?? "",
    );
}
