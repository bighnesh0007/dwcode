import { CHANGELOG, ChangelogEntry, ChangelogStatus, ChangelogCategory } from "@/lib/changelog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
    Rocket,
    Wrench,
    Zap,
    Bug,
    Shield,
    Gauge,
    Code2,
    Clock,
    Lightbulb,
    CheckCircle2,
    CircleDot,
    CalendarDays,
} from "lucide-react";

// ─── Config maps ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
    ChangelogStatus,
    { label: string; className: string; dotClass: string; icon: React.ReactNode }
> = {
    shipped: {
        label: "Shipped",
        className: "text-green-600 bg-green-500/10 border-green-500/30 dark:text-green-400",
        dotClass: "bg-green-500",
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    "in-progress": {
        label: "In Progress",
        className: "text-blue-600 bg-blue-500/10 border-blue-500/30 dark:text-blue-400",
        dotClass: "bg-blue-500 animate-pulse",
        icon: <CircleDot className="w-3.5 h-3.5" />,
    },
    planned: {
        label: "Planned",
        className: "text-yellow-600 bg-yellow-500/10 border-yellow-500/30 dark:text-yellow-400",
        dotClass: "bg-yellow-500",
        icon: <Clock className="w-3.5 h-3.5" />,
    },
    idea: {
        label: "Idea",
        className: "text-purple-600 bg-purple-500/10 border-purple-500/30 dark:text-purple-400",
        dotClass: "bg-purple-400",
        icon: <Lightbulb className="w-3.5 h-3.5" />,
    },
};

const CATEGORY_CONFIG: Record<
    ChangelogCategory,
    { label: string; icon: React.ReactNode; className: string }
> = {
    feature: {
        label: "Feature",
        icon: <Rocket className="w-3 h-3" />,
        className: "text-primary bg-primary/10 border-primary/20",
    },
    improvement: {
        label: "Improvement",
        icon: <Zap className="w-3 h-3" />,
        className: "text-sky-600 bg-sky-500/10 border-sky-500/20 dark:text-sky-400",
    },
    bugfix: {
        label: "Bug Fix",
        icon: <Bug className="w-3 h-3" />,
        className: "text-red-600 bg-red-500/10 border-red-500/20 dark:text-red-400",
    },
    security: {
        label: "Security",
        icon: <Shield className="w-3 h-3" />,
        className: "text-orange-600 bg-orange-500/10 border-orange-500/20 dark:text-orange-400",
    },
    performance: {
        label: "Performance",
        icon: <Gauge className="w-3 h-3" />,
        className: "text-teal-600 bg-teal-500/10 border-teal-500/20 dark:text-teal-400",
    },
    dx: {
        label: "Dev Experience",
        icon: <Code2 className="w-3 h-3" />,
        className: "text-indigo-600 bg-indigo-500/10 border-indigo-500/20 dark:text-indigo-400",
    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

// Group entries by status bucket
const STATUS_ORDER: ChangelogStatus[] = ["in-progress", "planned", "idea", "shipped"];

function groupEntries(entries: ChangelogEntry[]) {
    const groups: Record<ChangelogStatus, ChangelogEntry[]> = {
        shipped: [],
        "in-progress": [],
        planned: [],
        idea: [],
    };
    for (const e of entries) {
        groups[e.status].push(e);
    }
    return groups;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EntryCard({ entry }: { entry: ChangelogEntry }) {
    const status = STATUS_CONFIG[entry.status];
    const category = CATEGORY_CONFIG[entry.category];

    return (
        <div className="relative pl-6">
            {/* Timeline dot */}
            <span
                className={`absolute left-0 top-[7px] w-2.5 h-2.5 rounded-full border-2 border-background ${status.dotClass}`}
            />

            <div className="space-y-1.5">
                {/* Title + badges row */}
                <div className="flex flex-wrap items-start gap-2">
                    <h3 className="text-sm font-semibold leading-snug flex-1 min-w-0">
                        {entry.title}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge
                            variant="outline"
                            className={`text-[10px] py-0 h-5 gap-1 ${category.className}`}
                        >
                            {category.icon}
                            {category.label}
                        </Badge>
                    </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {entry.description}
                </p>

                {/* Date + tags */}
                <div className="flex items-center flex-wrap gap-2 pt-0.5">
                    {entry.date && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                            <CalendarDays className="w-3 h-3" />
                            {formatDate(entry.date)}
                        </span>
                    )}
                    {(entry.tags ?? []).map((tag) => (
                        <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                            #{tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Section({
    status,
    entries,
}: {
    status: ChangelogStatus;
    entries: ChangelogEntry[];
}) {
    if (entries.length === 0) return null;
    const cfg = STATUS_CONFIG[status];

    return (
        <section className="space-y-5">
            {/* Section header */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${cfg.className} border px-3 py-1 rounded-full`}>
                        {cfg.icon}
                        {cfg.label}
                    </span>
                </div>
                <div className="flex-1 border-t border-dashed border-border/60" />
                <span className="text-xs text-muted-foreground">{entries.length} item{entries.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Entries — vertical timeline */}
            <div className="relative ml-1.5 space-y-6 border-l border-border/50 pl-1">
                {entries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} />
                ))}
            </div>
        </section>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChangelogPage() {
    const groups = groupEntries(CHANGELOG);

    const shippedCount = groups.shipped.length;
    const inProgressCount = groups["in-progress"].length;
    const plannedCount = groups.planned.length + groups.idea.length;

    return (
        <div className="container max-w-screen-md mx-auto py-10 px-4 space-y-10">
            {/* Hero */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary text-sm font-medium uppercase tracking-widest">
                    <Wrench className="w-4 h-4" />
                    Pipeline & Changelog
                </div>
                <h1 className="text-3xl font-bold tracking-tight">
                    What&apos;s happening with DWCode
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-prose">
                    Follow along as the platform grows. This page is updated every time
                    something ships, something breaks and gets fixed, or a new idea makes
                    it onto the roadmap.
                </p>

                {/* Summary pills */}
                <div className="flex flex-wrap gap-2 pt-1">
                    <Card className="inline-flex py-0">
                        <CardContent className="flex items-center gap-2 px-4 py-2.5">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="text-sm font-semibold text-green-600 dark:text-green-400">{shippedCount}</span>
                            <span className="text-xs text-muted-foreground">shipped</span>
                        </CardContent>
                    </Card>
                    <Card className="inline-flex py-0">
                        <CardContent className="flex items-center gap-2 px-4 py-2.5">
                            <CircleDot className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{inProgressCount}</span>
                            <span className="text-xs text-muted-foreground">in progress</span>
                        </CardContent>
                    </Card>
                    <Card className="inline-flex py-0">
                        <CardContent className="flex items-center gap-2 px-4 py-2.5">
                            <Lightbulb className="w-4 h-4 text-purple-500" />
                            <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">{plannedCount}</span>
                            <span className="text-xs text-muted-foreground">planned / ideas</span>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <hr className="border-border/50" />

            {/* Sections in order: in-progress → planned → idea → shipped */}
            {STATUS_ORDER.map((status) => (
                <Section key={status} status={status} entries={groups[status]} />
            ))}
        </div>
    );
}
