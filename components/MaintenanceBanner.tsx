"use client";

import { useState } from "react";
import { MAINTENANCE_MODE } from "@/lib/config";
import { WrenchIcon, X } from "lucide-react";

/**
 * Shows a dismissible full-screen overlay when NEXT_PUBLIC_MAINTENANCE_MODE=true.
 * Renders nothing when maintenance mode is off.
 */
export function MaintenanceBanner() {
    const [dismissed, setDismissed] = useState(false);

    if (!MAINTENANCE_MODE || dismissed) return null;

    return (
        /* Overlay — sits above everything, blurs the content underneath */
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="relative mx-4 w-full max-w-md rounded-2xl border bg-card shadow-2xl p-8 text-center space-y-5">
                {/* Close / dismiss */}
                <button
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss maintenance notice"
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Icon */}
                <div className="flex justify-center">
                    <span className="inline-flex items-center justify-center rounded-full bg-yellow-500/10 p-4">
                        <WrenchIcon className="w-8 h-8 text-yellow-500 animate-[spin_3s_linear_infinite]" />
                    </span>
                </div>

                {/* Heading */}
                <div className="space-y-1">
                    <h2 className="text-xl font-bold tracking-tight">
                        Under Maintenance
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        We&apos;re making some improvements to DWCode. Things will be back
                        to normal shortly.
                    </p>
                </div>

                {/* Divider */}
                <div className="border-t" />

                {/* Sub-text */}
                <p className="text-xs text-muted-foreground">
                    You can still browse the site — some features may not work as
                    expected during this window. Thank you for your patience!
                </p>

                {/* Dismiss button */}
                <button
                    onClick={() => setDismissed(true)}
                    className="inline-flex items-center justify-center rounded-lg bg-yellow-500 text-black text-sm font-medium px-6 py-2.5 hover:bg-yellow-400 transition-colors"
                >
                    Got it, let me browse
                </button>
            </div>
        </div>
    );
}
