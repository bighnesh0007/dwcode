// Simple markdown renderer — converts the most common syntax
export function renderMarkdown(md: string): string {
    return md
        .replace(/^### (.+)$/gm, "<h3 class='text-base font-semibold mt-5 mb-2'>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2 class='text-lg font-bold mt-6 mb-2'>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1 class='text-xl font-bold mt-6 mb-3'>$1</h1>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code class='bg-muted px-1 py-0.5 rounded text-sm font-mono'>$1</code>")
        .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre class='bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto my-3'><code>$1</code></pre>")
        .replace(/^> (.+)$/gm, "<blockquote class='border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-2'>$1</blockquote>")
        .replace(/\[(.+?)\]\((.+?)\)/g, "<a href='$2' class='text-primary underline hover:no-underline' target='_blank' rel='noopener'>$1</a>")
        .replace(/^[-*] (.+)$/gm, "<li class='ml-4 list-disc'>$1</li>")
        .replace(/\n\n/g, "</p><p class='mb-3'>")
        .replace(/\n/g, "<br/>");
}
