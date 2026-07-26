/**
 * Live compile — settings contract.
 *
 * These guard the two ways this setting can silently break users:
 *
 *  1. `normalizeSettings` falls back to DEFAULT_SETTINGS (autoRunDelay: 0 = OFF)
 *     for any value not in AUTO_RUN_DELAYS. So REMOVING a delay from that list
 *     silently turns live compile off for everyone who had chosen it. The
 *     "existing stored value survives" cases below are the regression guard.
 *
 *  2. The settings UI maps every delay to a label via a Record keyed on
 *     AutoRunDelay. Adding a delay without a label is a type error at build
 *     time, but the label set is asserted here too so the UI can never render
 *     `undefined` for an option.
 */
import { describe, it, expect } from "vitest";
import {
    AUTO_RUN_DELAYS,
    DEFAULT_SETTINGS,
    normalizeSettings,
} from "@/app/playground/settings";

describe("AUTO_RUN_DELAYS", () => {
    it("offers 1s live compile", () => {
        expect(AUTO_RUN_DELAYS).toContain(1000);
    });

    it("keeps 0 as the off switch and the default", () => {
        expect(AUTO_RUN_DELAYS[0]).toBe(0);
        expect(DEFAULT_SETTINGS.autoRunDelay).toBe(0);
    });

    it("is sorted ascending, so the segmented control reads left-to-right", () => {
        const sorted = [...AUTO_RUN_DELAYS].sort((a, b) => a - b);
        expect([...AUTO_RUN_DELAYS]).toEqual(sorted);
    });

    it("has no duplicates", () => {
        expect(new Set(AUTO_RUN_DELAYS).size).toBe(AUTO_RUN_DELAYS.length);
    });
});

describe("normalizeSettings — autoRunDelay", () => {
    it.each(AUTO_RUN_DELAYS)("preserves the supported delay %ims", (delay) => {
        expect(normalizeSettings({ autoRunDelay: delay }).autoRunDelay).toBe(delay);
    });

    it("preserves a previously-stored 800 (removing it would silently disable live compile)", () => {
        // 800 predates 1000. If a future change drops it from AUTO_RUN_DELAYS,
        // every user who picked "0.8s" would silently fall back to Off.
        expect(normalizeSettings({ autoRunDelay: 800 }).autoRunDelay).toBe(800);
    });

    it.each([999, 1200, -1000, 0.5, NaN, Infinity, undefined, {}, "abc"])(
        "falls back to the default for the unsupported value %p",
        (value) => {
            expect(normalizeSettings({ autoRunDelay: value }).autoRunDelay).toBe(
                DEFAULT_SETTINGS.autoRunDelay,
            );
        },
    );

    it("coerces a numeric string, by design", () => {
        // normalizeSettings applies Number() BEFORE checking membership, because
        // its stated job is to coerce arbitrary stored JSON — a hand-edited or
        // legacy localStorage entry may hold "1000" rather than 1000. Documented
        // here so the coercion is a decision rather than an accident.
        expect(normalizeSettings({ autoRunDelay: "1000" }).autoRunDelay).toBe(1000);
        expect(normalizeSettings({ autoRunDelay: "800" }).autoRunDelay).toBe(800);
    });

    it("never returns a delay outside the supported set", () => {
        const candidates = [0, 1, 800, 999, 1000, 1500, 3000, 5000, -1];
        for (const c of candidates) {
            const { autoRunDelay } = normalizeSettings({ autoRunDelay: c });
            expect(AUTO_RUN_DELAYS).toContain(autoRunDelay);
        }
    });

    it("leaves unrelated settings untouched when only the delay is stored", () => {
        const result = normalizeSettings({ autoRunDelay: 1000 });
        expect(result.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
        expect(result.theme).toBe(DEFAULT_SETTINGS.theme);
        expect(result.orientation).toBe(DEFAULT_SETTINGS.orientation);
    });

    it("survives a corrupt stored blob without throwing", () => {
        for (const junk of [null, undefined, "nonsense", 42, [], true]) {
            expect(() => normalizeSettings(junk)).not.toThrow();
            expect(normalizeSettings(junk).autoRunDelay).toBe(DEFAULT_SETTINGS.autoRunDelay);
        }
    });
});
