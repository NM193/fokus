import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Palette } from "./settings";
import type { Phase } from "./useTimer";

/**
 * Running inside the Mac app (Tauri) rather than a browser tab. Everything
 * desktop-only checks this, so the same frontend still runs in a browser.
 */
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** This web view is the mini timer's window, not the app's (src-tauri/src/widget.rs). */
export const isWidgetWindow = isDesktop && getCurrentWindow().label === "widget";

/** The events the two windows and the app pass between them. */
export const EVENTS = {
  /** Main window → widget: the timer as it now stands. */
  state: "fokus://state",
  /** Widget or menu bar → main window: "toggle" or "skip". */
  command: "fokus://command",
  /** App → main window: the running phase's time is up. */
  due: "fokus://due",
  /** App → main window: the mini timer opened (true) or closed (false). */
  widget: "fokus://widget",
  /** Widget → main window: listening now, send the state. */
  widgetReady: "fokus://widget-ready",
} as const;

export type Command = "toggle" | "skip";

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

