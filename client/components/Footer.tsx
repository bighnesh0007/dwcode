import Link from "next/link";
// lucide-react v1 dropped brand icons, so GitBranch stands in for GitHub —
// matching the convention already used in app/playground/components/GitHubImport.tsx.
import { Code2, GitBranch, Heart, MessageSquare, Rss } from "lucide-react";

const REPO_URL = "https://github.com/bighnesh0007/dwcode";

const COLUMNS: {
  heading: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    heading: "Practice",
    links: [
      { label: "Problems", href: "/problems" },
      { label: "Playground", href: "/playground" },
      { label: "Contests", href: "/contests" },
      { label: "Leaderboard", href: "/leaderboard" },
    ],
  },
  {
    heading: "Community",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Add a Problem", href: "/create" },
      { label: "Store", href: "/store" },
      { label: "Sponsor", href: "/sponsor" },
      { label: "Discussions", href: `${REPO_URL}/discussions`, external: true },
    ],
  },
  {
    heading: "Project",
    links: [
      // Moved out of the navbar and into the footer.
      { label: "Changelog", href: "/changelog" },
      { label: "Source Code", href: REPO_URL, external: true },
      { label: "Report an Issue", href: `${REPO_URL}/issues/new`, external: true },
      { label: "Contribute", href: `${REPO_URL}/blob/master/README.md`, external: true },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="container mx-auto max-w-screen-xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand + blurb */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold tracking-tight text-primary">DWCode</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              The DataWeave practice arena for MuleSoft developers. Solve real
              transformation problems against a live <code className="font-mono text-xs">%dw 2.0</code>{" "}
              compiler.
            </p>

            <div className="mt-4 flex items-center gap-2">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="DWCode on GitHub"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <GitBranch className="h-4 w-4" />
              </a>
              <a
                href={`${REPO_URL}/discussions`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Community discussions"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <MessageSquare className="h-4 w-4" />
              </a>
              <Link
                href="/blog"
                aria-label="DWCode blog"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Rss className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
                {column.heading}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {year} DWCode · Licensed under the{" "}
            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Apache License 2.0
            </a>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Built with <Heart className="h-3 w-3 fill-current text-red-500" aria-hidden /> for the
            MuleSoft community
          </p>
        </div>
      </div>
    </footer>
  );
}
