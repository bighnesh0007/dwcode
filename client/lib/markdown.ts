// Shared Markdown renderer used by blog posts, discussion comments, and any
// other place that displays user-authored text.
//
// Callers inject the returned string as raw inner HTML, so this escapes HTML
// *first* and only allows http(s) links. Never bypass the escaping step.
//
// SECURITY HISTORY (audit finding H-1). This file previously escaped only
// `&`, `<` and `>` and claimed that closed the stored-XSS vector. It did not:
// the generated markup puts values inside SINGLE-quoted attributes, and an
// unescaped `'` in a link URL breaks out of `href` into a new attribute. HTML5
// tokenisation recovers from the missing space after a quoted value, so
//
//     [x](https://e.com'onmouseover='location=name)
//
// produced a live event handler. Quotes are now escaped as well, and link URLs
// are additionally parsed with `new URL()` so only http(s) survives. Both
// defences are required: escaping alone would still admit a `javascript:` URL
// if the protocol test were ever loosened.
//
// This is an interim hardening. SEC-11 replaces the whole regex chain with a
// real parser plus sanitiser (marked + DOMPurify); do not extend this file.
//
// Returns inner HTML ready to drop into a container element (it wraps its own
// paragraphs).

/** Only http(s) URLs may reach an `href`. Returns null for anything else. */
function safeHttpUrl(raw: string): string | null {
    try {
        const url = new URL(raw);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

export function renderMarkdown(md: string): string {
    const body = md
        // Escape HTML before applying any markdown. Quotes MUST be included —
        // see the security note above.
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        // Fenced code blocks before inline code so backticks inside don't clash.
        .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre class='bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto my-3'><code>$1</code></pre>")
        .replace(/`([^`]+)`/g, "<code class='bg-muted px-1 py-0.5 rounded text-sm font-mono'>$1</code>")
        .replace(/^### (.+)$/gm, "<h3 class='text-base font-semibold mt-5 mb-2'>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2 class='text-lg font-bold mt-6 mb-2'>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1 class='text-xl font-bold mt-6 mb-3'>$1</h1>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        // Blockquotes match the escaped ">".
        .replace(/^&gt; (.+)$/gm, "<blockquote class='border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-2'>$1</blockquote>")
        // Only http(s) links. The captured URL is already HTML-escaped, so it is
        // safe to emit inside the attribute as-is; it is DECODED only to run the
        // protocol check against the real value, because escaping turns a
        // legitimate `?a=1&b=2` into `?a=1&amp;b=2` which is not a parseable URL.
        .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, (match, text: string, escapedUrl: string) => {
            const decoded = escapedUrl
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, "&"); // last, so `&amp;#39;` decodes to `&#39;`
            // Not a usable http(s) URL — leave the markdown as inert literal text.
            if (!safeHttpUrl(decoded)) return match;
            return `<a href='${escapedUrl}' class='text-primary underline hover:no-underline' target='_blank' rel='noopener noreferrer'>${text}</a>`;
        })
        .replace(/^[-*] (.+)$/gm, "<li class='ml-4 list-disc'>$1</li>")
        .replace(/\n\n/g, "</p><p class='mb-3'>")
        .replace(/\n/g, "<br/>");
    return `<p class='mb-3'>${body}</p>`;
}
