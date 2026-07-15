// Shared Markdown renderer used by blog posts, discussion comments, and any
// other place that displays user-authored text.
//
// Callers inject the returned string as raw inner HTML, so this escapes HTML
// *first* and only allows http(s) links — that combination closes the
// stored-XSS vector while still supporting the small subset of Markdown we
// care about. Never bypass the escaping step.
//
// Returns inner HTML ready to drop into a container element (it wraps its own
// paragraphs).
export function renderMarkdown(md: string): string {
    const body = md
        // Escape HTML before applying any markdown.
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
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
        // Only http(s) links; the URL was already HTML-escaped above.
        .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, "<a href='$2' class='text-primary underline hover:no-underline' target='_blank' rel='noopener noreferrer'>$1</a>")
        .replace(/^[-*] (.+)$/gm, "<li class='ml-4 list-disc'>$1</li>")
        .replace(/\n\n/g, "</p><p class='mb-3'>")
        .replace(/\n/g, "<br/>");
    return `<p class='mb-3'>${body}</p>`;
}
