"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RotateCcw, Settings2 } from "lucide-react";
import {
    AUTO_RUN_DELAYS,
    DEFAULT_SETTINGS,
    type AutoRunDelay,
    type EditorThemeSetting,
    type PlaygroundSettings as Settings,
} from "../settings";

const THEME_OPTIONS: { value: EditorThemeSetting; label: string }[] = [
    { value: "auto", label: "Match site" },
    { value: "vs-dark", label: "Dark" },
    { value: "vs-light", label: "Light" },
    { value: "hc-black", label: "High contrast" },
];

const AUTO_RUN_LABELS: Record<AutoRunDelay, string> = {
    0: "Off",
    800: "0.8s",
    1500: "1.5s",
    3000: "3s",
};

/** A compact segmented control — clearer than a dropdown for 2-4 options. */
function Segmented<T extends string | number>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div className="inline-flex rounded-md border p-0.5">
            {options.map((option) => (
                <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        value === option.value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
                <Label className="text-sm font-medium">{label}</Label>
                {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

export function PlaygroundSettings({
    settings,
    onChange,
}: {
    settings: Settings;
    onChange: (next: Settings) => void;
}) {
    const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
        onChange({ ...settings, [key]: value });

    return (
        <Dialog>
            <DialogTrigger
                render={
                    <button
                        type="button"
                        title="Playground settings"
                        aria-label="Playground settings"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <Settings2 className="h-3.5 w-3.5" />
                    </button>
                }
            />
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Playground settings</DialogTitle>
                    <DialogDescription>
                        Saved in this browser and applied to every editor here.
                    </DialogDescription>
                </DialogHeader>

                <div className="divide-y">
                    <Row label="Editor theme">
                        <Segmented
                            value={settings.theme}
                            options={THEME_OPTIONS}
                            onChange={(v) => set("theme", v)}
                        />
                    </Row>

                    <Row label="Font size" hint={`${settings.fontSize}px`}>
                        <input
                            type="range"
                            min={10}
                            max={24}
                            step={1}
                            value={settings.fontSize}
                            onChange={(e) => set("fontSize", Number(e.target.value))}
                            className="w-32 accent-primary"
                            aria-label="Editor font size"
                        />
                    </Row>

                    <Row label="Indent size">
                        <Segmented
                            value={settings.tabSize}
                            options={[
                                { value: 2 as const, label: "2" },
                                { value: 4 as const, label: "4" },
                            ]}
                            onChange={(v) => set("tabSize", v)}
                        />
                    </Row>

                    <Row label="Word wrap">
                        <Segmented
                            value={settings.wordWrap ? "on" : "off"}
                            options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                            ]}
                            onChange={(v) => set("wordWrap", v === "on")}
                        />
                    </Row>

                    <Row label="Minimap">
                        <Segmented
                            value={settings.minimap ? "on" : "off"}
                            options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                            ]}
                            onChange={(v) => set("minimap", v === "on")}
                        />
                    </Row>

                    <Row label="Line numbers">
                        <Segmented
                            value={settings.lineNumbers ? "on" : "off"}
                            options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                            ]}
                            onChange={(v) => set("lineNumbers", v === "on")}
                        />
                    </Row>

                    <Row label="Bracket colours">
                        <Segmented
                            value={settings.bracketPairColorization ? "on" : "off"}
                            options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                            ]}
                            onChange={(v) => set("bracketPairColorization", v === "on")}
                        />
                    </Row>

                    <Row
                        label="Auto-run"
                        hint="Run automatically after you stop typing"
                    >
                        <Segmented
                            value={settings.autoRunDelay}
                            options={AUTO_RUN_DELAYS.map((d) => ({
                                value: d,
                                label: AUTO_RUN_LABELS[d],
                            }))}
                            onChange={(v) => set("autoRunDelay", v)}
                        />
                    </Row>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => onChange({ ...DEFAULT_SETTINGS })}
                >
                    <RotateCcw className="h-3 w-3" /> Reset to defaults
                </Button>
            </DialogContent>
        </Dialog>
    );
}
