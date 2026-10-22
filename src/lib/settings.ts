import { load, save } from "./store";

/** The three pastel palettes. Each is a block of tokens in styles.css. */
export type Palette = "lavender" | "sage" | "rose";
/** The Mac app's window: macOS glass behind a pastel tint, or plain paper. */
export type Surface = "glass" | "solid";

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
  /** The Mac app says so on screen when a phase ends, unless its window is in front. */
  notify: boolean;
  palette: Palette;
  surface: Surface;
  /** The Mac app opens with the Mac, quietly, into the menu bar. */
  openAtLogin: boolean;
};

export const FOCUS_OPTIONS = [15, 25, 30, 45, 60, 90];
export const SHORT_OPTIONS = [5, 10, 15, 20];
export const LONG_OPTIONS = [15, 20, 30];
export const EVERY_OPTIONS = [2, 3, 4, 5];

export const DEFAULT_SETTINGS: Settings = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  every: 4,
  autoStart: false,
  sound: true,
  notify: true,
  palette: "lavender",
  surface: "glass",
  openAtLogin: true,
};

const KEY = "fokus.settings.v1";

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(KEY, {}) };
}

export function saveSettings(settings: Settings) {
  save(KEY, settings);
}
