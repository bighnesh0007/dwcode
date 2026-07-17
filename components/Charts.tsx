import React from "react";

export function Heatmap({ data }: { data: { date: string; count: number }[] }) {
    const max = Math.max(...data.map((d) => d.count), 1);

    const color = (count: number) => {
        if (count === 0) return "bg-muted/40";
        const pct = count / max;
        if (pct < 0.25) return "bg-green-800/60";
        if (pct < 0.5) return "bg-green-600/70";
        if (pct < 0.75) return "bg-green-500/80";
        return "bg-green-400";
    };

    return (
        <div className="flex gap-1 flex-wrap">
            {data.map((d) => (
                <div
                    key={d.date}
                    title={`${d.date}: ${d.count} submission${d.count !== 1 ? "s" : ""}`}
                    className={`w-4 h-4 rounded-sm ${color(d.count)} cursor-default transition-colors`}
                />
            ))}
        </div>
    );
}

export function ProgressRing({ value, max, color, size = 80 }: { value: number; max: number; color: string; size?: number }) {
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const dash = pct * circ;

    return (
        <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="stroke-muted/40" fill="none" />
            <circle
                cx={size / 2} cy={size / 2} r={r} strokeWidth={6}
                fill="none"
                stroke="currentColor"
                className={color}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeLinecap="round"
            />
        </svg>
    );
}
