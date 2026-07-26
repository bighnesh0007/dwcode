/**
 * User-customisable playground preferences.
 *
 * Persisted to localStorage so the playground feels like the user's own editor
 * between visits. Every value is validated on load — a hand-edited or stale
 * localStorage entry must never be able to break the editor.
 */

export const EDITOR_THEMES = ["auto", "vs-dark", "vs-light", "hc-black"] as const;
export type EditorThemeSetting = (typeof EDITOR_THEMES)[number];

/**
 * Live-compile debounce options, in ms. 0 disables it.
 *
 * `800` is kept even though `1000` sits right next to it: `normalizeSettings`
 * falls back to the DEFAULT (which is 0 = off) for any value not in this list,
 * so removing 800 would silently switch live compile OFF for everyone who had
 * chosen it. Values may be added freely; removing one is a breaking change to
 * stored preferences.
 */
export const AUTO_RUN_DELAYS = [0, 800, 1000, 1500, 3000] as const;
export type AutoRunDelay = (typeof AUTO_RUN_DELAYS)[number];

export interface PlaygroundSettings {
  /** "auto" follows the site light/dark theme. */
  theme: EditorThemeSetting;
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  bracketPairColorization: boolean;
  /** 0 disables auto-run; otherwise debounce delay in ms after typing stops. */
  autoRunDelay: AutoRunDelay;
  /** Persisted panel orientation (was previously lost on reload). */
  orientation: "horizontal" | "vertical";
}

export const DEFAULT_SETTINGS: PlaygroundSettings = {
  theme: "auto",
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  minimap: false,
  lineNumbers: true,
  bracketPairColorization: true,
  autoRunDelay: 0,
  orientation: "horizontal",
};

export const LS_SETTINGS = "dwcode_pg_settings";

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Coerce arbitrary stored JSON into a valid settings object. */
export function normalizeSettings(raw: unknown): PlaygroundSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };

  const fontSize = Number(raw.fontSize);
  const tabSize = Number(raw.tabSize);
  const autoRunDelay = Number(raw.autoRunDelay);

  return {
    theme: EDITOR_THEMES.includes(raw.theme as EditorThemeSetting)
      ? (raw.theme as EditorThemeSetting)
      : DEFAULT_SETTINGS.theme,
    fontSize:
      Number.isFinite(fontSize) && fontSize >= MIN_FONT_SIZE && fontSize <= MAX_FONT_SIZE
        ? Math.round(fontSize)
        : DEFAULT_SETTINGS.fontSize,
    tabSize: tabSize === 4 ? 4 : 2,
    wordWrap: bool(raw.wordWrap, DEFAULT_SETTINGS.wordWrap),
    minimap: bool(raw.minimap, DEFAULT_SETTINGS.minimap),
    lineNumbers: bool(raw.lineNumbers, DEFAULT_SETTINGS.lineNumbers),
    bracketPairColorization: bool(
      raw.bracketPairColorization,
      DEFAULT_SETTINGS.bracketPairColorization,
    ),
    autoRunDelay: (AUTO_RUN_DELAYS as readonly number[]).includes(autoRunDelay)
      ? (autoRunDelay as AutoRunDelay)
      : DEFAULT_SETTINGS.autoRunDelay,
    orientation: raw.orientation === "vertical" ? "vertical" : "horizontal",
  };
}

export function loadSettings(): PlaygroundSettings {
  try {
    const stored = localStorage.getItem(LS_SETTINGS);
    return stored ? normalizeSettings(JSON.parse(stored)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: PlaygroundSettings): void {
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  } catch {
    /* private mode / quota — preferences are non-critical */
  }
}

/** Resolve the "auto" theme against the site's current light/dark mode. */
export function resolveEditorTheme(
  setting: EditorThemeSetting,
  siteTheme: string | undefined,
): string {
  if (setting !== "auto") return setting;
  return siteTheme === "light" ? "vs-light" : "vs-dark";
}

/** Monaco editor options derived from the settings. */
export function toEditorOptions(settings: PlaygroundSettings, fontSizeDelta = 0) {
  return {
    fontSize: settings.fontSize + fontSizeDelta,
    tabSize: settings.tabSize,
    wordWrap: settings.wordWrap ? ("on" as const) : ("off" as const),
    minimap: { enabled: settings.minimap },
    lineNumbers: settings.lineNumbers ? ("on" as const) : ("off" as const),
    bracketPairColorization: { enabled: settings.bracketPairColorization },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 8 },
    smoothScrolling: true,
    renderLineHighlight: "line" as const,
  };
}
