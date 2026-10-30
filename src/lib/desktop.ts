import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WidgetLook } from "../components/Widget";
import type { Palette } from "./settings";
import type { Phase } from "./useTimer";

/** Running inside Fokus's own app (Tauri), on the Mac or on a phone, rather than a browser tab. */
const isApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Running inside the phone app (Tauri on iOS or Android). An iPad's web view
 * says it is a Mac, but a Mac has no touch points.
 */
export const isPhone =
  isApp &&
  (/Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

/**
 * Running inside the Mac app rather than a browser tab or the phone app.
 * Everything desktop-only checks this, so the same frontend still runs in a
 * browser, and on a phone as a browser would plus what usePhone adds.
 */
export const isDesktop = isApp && !isPhone;

/**
 * The desktop app on Windows rather than the Mac. Most of it is the same;
 * what differs checks this, and the page carries it as data-os (main.tsx).
 */
export const isWindows = isDesktop && /Windows/.test(navigator.userAgent);

/** The keys that start and pause from anywhere (shortcut.rs): the same keys on both, named as each names them. */
export const SHORTCUT = isWindows ? "Ctrl+Alt+F" : "⌃⌥F";

/** This web view is the mini timer's window, not the app's (src-tauri/src/widget.rs). */
export const isWidgetWindow = isDesktop && getCurrentWindow().label === "widget";
/** This web view is the end-of-phase card (src-tauri/src/alert.rs). */
export const isAlertWindow = isDesktop && getCurrentWindow().label === "alert";
/** This web view draws the effect that comes with the sound (src-tauri/src/effect.rs). */
export const isEffectWindow = isDesktop && getCurrentWindow().label === "effect";

/** The events the two windows and the app pass between them. */
export const EVENTS = {
  /** Main window → widget: the timer as it now stands. */
  state: "fokus://state",
  /** Widget, card or menu bar → main window: a `Command`. */
  command: "fokus://command",
  /** App → main window: the running phase's time is up. */
  due: "fokus://due",
  /** App → main window: the mini timer opened (true) or closed (false). */
  widget: "fokus://widget",
  /** Widget → main window: listening now, send the state. */
  widgetReady: "fokus://widget-ready",
  /** App → widget: the pointer came over it or left, or it moved corner. */
  widgetPlace: "fokus://widget-place",
  /** App → card: what it says now. */
  alert: "fokus://alert",
  /** Card → main window: listening now, send the state. */
  alertReady: "fokus://alert-ready",
  /** App → effect: draw this one, now. */
  effect: "fokus://effect",
  /** Menu bar → main window: install the new version it offers. */
  update: "fokus://update",
} as const;

/** "start" starts only what is not running: the card's button, pressed late, must not pause. */
export type Command = "toggle" | "skip" | "start";

/**
 * Everything the widget needs to draw itself. The time left is not in it:
 * while running the widget counts down from `endsAt` with its own clock, so
 * the main window only sends when something actually changes.
 */
export type Snapshot = {
  phase: Phase;
  running: boolean;
  /** When the running phase ends, in ms since the epoch. */
  endsAt: number | null;
  /** What is left while stopped, in ms. */
  left: number;
  total: number;
  upNext: Phase;
  current: string | null;
  palette: Palette;
  look: WidgetLook;
};

/**
 * Listen to an app event from an effect. Returns the cleanup: `listen`
 * resolves later, and an effect that is already gone must still unlisten.
 */
export function on<T>(event: string, handler: (payload: T) => void, ready?: () => void): () => void {
  let off: (() => void) | undefined;
  let gone = false;
  void listen<T>(event, (e) => handler(e.payload)).then((unlisten) => {
    if (gone) return unlisten();
    off = unlisten;
    ready?.();
  });
  return () => {
    gone = true;
    off?.();
  };
}

