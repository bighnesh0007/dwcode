"use client";

import Link from "next/link";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewName, useSkin } from "@/components/SkinProvider";

/**
 * Sticky notice shown while a theme is being previewed.
 *
 * A preview deliberately follows the user across the whole site — that is the point
 * of "try": you should see the theme on the problems list and the editor, not just on
 * a store card. This banner is what stops that from being confusing, and guarantees
 * there is always a one-click way out.
 */
export function SkinPreviewBanner() {
    const { previewSkin, cancelPreview } = useSkin();
    const name = usePreviewName();

    if (!previewSkin) return null;

    return (
        <div className="sticky top-14 z-40 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/25 bg-primary/10 px-4 py-2 text-xs backdrop-blur">
            <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-foreground">
                Previewing <span className="font-semibold">{name}</span> — not saved yet.
            </span>
            <div className="ml-auto flex items-center gap-2">
                <Link href="/store">
                    <Button size="sm" className="h-6 text-[11px]">
                        Get this theme
                    </Button>
                </Link>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 text-[11px]"
                    onClick={cancelPreview}
                >
                    <X className="h-3 w-3" /> Stop preview
                </Button>
            </div>
        </div>
    );
}
