"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SKIN, LS_ACTIVE_SKIN, SKIN_IDS, findSkin } from "@/lib/themes";

const SS_PREVIEW_SKIN = "dwcode_preview_skin";

interface SkinContextValue {
    /** The skin the user owns and has equipped (persisted in localStorage). */
    activeSkin: string;
    /** A temporary try-before-you-buy skin (sessionStorage, survives navigation). */
    previewSkin: string | null;
    /** What is actually on screen right now. */
    effectiveSkin: string;
    /** Start previewing a skin without owning it. */
    startPreview: (id: string) => void;
    /** Drop the preview and go back to the equipped skin. */
    cancelPreview: () => void;
    /** Equip a skin permanently. Caller is responsible for ownership checks. */
    applySkin: (id: string) => void;
}

const SkinContext = createContext<SkinContextValue | null>(null);

function isKnownSkin(id: string | null): id is string {
    return id !== null && SKIN_IDS.includes(id);
}

export function SkinProvider({ children }: { children: React.ReactNode }) {
    const [activeSkin, setActiveSkin] = useState(DEFAULT_SKIN);
    const [previewSkin, setPreviewSkin] = useState<string | null>(null);

    // Read persisted state after mount. Doing this in an effect (rather than during
    // render) keeps the server and client markup identical — the <html> element gets
    // its data-skin attribute imperatively below.
    // Deferred with queueMicrotask so the state update does not happen synchronously
    // inside the effect body (matches the pattern in app/problems/[slug]/Workspace.tsx).
    useEffect(() => {
        queueMicrotask(() => {
            try {
                const stored = localStorage.getItem(LS_ACTIVE_SKIN);
                if (isKnownSkin(stored)) setActiveSkin(stored);
                const preview = sessionStorage.getItem(SS_PREVIEW_SKIN);
                if (isKnownSkin(preview)) setPreviewSkin(preview);
            } catch {
                /* private mode — fall back to the default skin */
            }
        });
    }, []);

    const effectiveSkin = previewSkin ?? activeSkin;

    // Drive the attribute the CSS in globals.css keys off.
    useEffect(() => {
        const root = document.documentElement;
        if (effectiveSkin === DEFAULT_SKIN) root.removeAttribute("data-skin");
        else root.dataset.skin = effectiveSkin;
    }, [effectiveSkin]);

    const startPreview = useCallback((id: string) => {
        if (!isKnownSkin(id)) return;
        setPreviewSkin(id);
        try {
            sessionStorage.setItem(SS_PREVIEW_SKIN, id);
        } catch {
            /* non-critical */
        }
    }, []);

    const cancelPreview = useCallback(() => {
        setPreviewSkin(null);
        try {
            sessionStorage.removeItem(SS_PREVIEW_SKIN);
        } catch {
            /* non-critical */
        }
    }, []);

    const applySkin = useCallback((id: string) => {
        if (!isKnownSkin(id)) return;
        setActiveSkin(id);
        setPreviewSkin(null);
        try {
            localStorage.setItem(LS_ACTIVE_SKIN, id);
            sessionStorage.removeItem(SS_PREVIEW_SKIN);
        } catch {
            /* non-critical */
        }
    }, []);

    const value = useMemo<SkinContextValue>(
        () => ({ activeSkin, previewSkin, effectiveSkin, startPreview, cancelPreview, applySkin }),
        [activeSkin, previewSkin, effectiveSkin, startPreview, cancelPreview, applySkin],
    );

    return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
    const ctx = useContext(SkinContext);
    if (!ctx) throw new Error("useSkin must be used inside <SkinProvider>");
    return ctx;
}

/** Human-readable name for the currently previewed skin, or null. */
export function usePreviewName(): string | null {
    const { previewSkin } = useSkin();
    return previewSkin ? findSkin(previewSkin)?.name ?? previewSkin : null;
}
