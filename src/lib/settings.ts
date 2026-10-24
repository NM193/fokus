import { load, save } from "./store";

/** The three pastel palettes. Each is a block of tokens in styles.css. */
export type Palette = "lavender" | "sage" | "rose";
/** The Mac app's window: macOS glass behind a pastel tint, or plain paper. */
export type Surface = "glass" | "solid";
/** How big the mini timer is drawn. */
export type WidgetSize = "small" | "medium" | "large";
/** What the Mac app shows with the sound when a phase ends (src-tauri/src/effect.rs). */
export type Effect = "none" | "ripple" | "glow";
/** Fokus's own two notes, or one of the Mac's (SYSTEM in src-tauri/src/chime.rs). */
export type SoundName = "chime" | "Glass" | "Ping" | "Purr" | "Hero" | "Submarine" | "Funk" | "Tink" | "Pop";

export type Settings = {
  /** Minutes. */
  focus: number;
  shortBreak: number;
  longBreak: number;
  /** A long break after this many focus blocks. */
  every: number;
  /** Start the next phase by itself when one ends. */
  autoStart: boolean;
  sound: boolean;
  /** Which sound, in the Mac app; a browser only has the chime. */
  soundName: SoundName;
  /** 0 to 1. */
  soundVolume: number;
  effect: Effect;
  /** The Mac app shows a card over everything when a phase ends, unless its window is in front. */
  alert: boolean;
  /** The Mac app says so in a notification when a phase ends, unless its window is in front. */
  notify: boolean;
  palette: Palette;
  surface: Surface;
  /** The Mac app opens with the Mac, quietly, into the menu bar. */
  openAtLogin: boolean;
  widgetSize: WidgetSize;
  /** The Mac app's mini timer, 0.4 to 1: the whole window, glass and all. */
  widgetOpacity: number;
  /** The mini timer shows only the time until the pointer is over it. */
  widgetPeek: boolean;
  /** What the mini timer shows besides the time. */
  widgetPhase: boolean;
  widgetLine: boolean;
  widgetToggle: boolean;
  widgetSkip: boolean;
};

export const FOCUS_OPTIONS = [15, 25, 30, 45, 60, 90];
export const SHORT_OPTIONS = [5, 10, 15, 20];
export const LONG_OPTIONS = [15, 20, 30];
export const EVERY_OPTIONS = [2, 3, 4, 5];
export const OPACITY_OPTIONS = [1, 0.85, 0.7, 0.55, 0.4];
/** What a length of your own may be, beside the options. */
export const FOCUS_RANGE = [1, 180] as const;
export const SHORT_RANGE = [1, 60] as const;
export const LONG_RANGE = [1, 90] as const;
export const EVERY_RANGE = [1, 12] as const;

export const EFFECTS: { value: Effect; label: string }[] = [
  { value: "none", label: "None" },
  { value: "ripple", label: "Ripple" },
  { value: "glow", label: "Edge glow" },
];

export const SOUNDS: { value: SoundName; label: string }[] = [
  { value: "chime", label: "Fokus chime" },
  { value: "Glass", label: "Glass" },
  { value: "Ping", label: "Ping" },
  { value: "Purr", label: "Purr" },
  { value: "Hero", label: "Hero" },
  { value: "Submarine", label: "Submarine" },
  { value: "Funk", label: "Funk" },
  { value: "Tink", label: "Tink" },
  { value: "Pop", label: "Pop" },
];

export const DEFAULT_SETTINGS: Settings = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  every: 4,
  autoStart: false,
  sound: true,
  soundName: "chime",
  soundVolume: 0.6,
  effect: "glow",
  alert: true,
  notify: true,
  palette: "lavender",
  surface: "glass",
  openAtLogin: true,
  widgetSize: "medium",
  widgetOpacity: 1,
  widgetPeek: false,
  widgetPhase: true,
  widgetLine: true,
  widgetToggle: true,
  widgetSkip: true,
};

const KEY = "fokus.settings.v1";

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(KEY, {}) };
}

export function saveSettings(settings: Settings) {
  save(KEY, settings);
}
