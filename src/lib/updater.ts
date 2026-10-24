import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { EVENTS, isDesktop, on } from "./desktop";

/** How often a new version is looked for after launch: Fokus lives in the menu bar and is rarely started again. */
const EVERY_MS = 3 * 60 * 60 * 1000;
/** Bringing the window up looks again, when the last look is older than this. */
const STALE_MS = 60 * 60 * 1000;

/**
 * A new version, from the GitHub release scripts/release.sh made. One state
 * for every place that offers it: the sidebar (UpdateNotice), Settings ->
 * Updates and the menu bar menu.
 *
 * Looked for at launch, every few hours after, when the window comes up a
 * while after the last look, and when Settings asks. Nothing is downloaded
 * until you say so. Updating restarts the app; a running timer survives
 * that, since it is a deadline in storage rather than a countdown in memory.
 */
export type Updater = {
  /** A newer version, from the last look that got an answer. */
  update: Update | null;
  /** A look is out. */
  looking: boolean;
  /** When the last look got an answer, in ms since the epoch. */
  lookedAt: number | null;
  /** The last look got no answer: no network, or GitHub is down. */
  failed: boolean;
  /** 0 to 100 while the update downloads. */
  percent: number | null;
  /** Why the last install did not go through. */
  error: string | null;
};

let state: Updater = { update: null, looking: false, lookedAt: null, failed: false, percent: null, error: null };
const listeners = new Set<() => void>();
// No look while an update downloads: it would swap the update out from under it.
let installing = false;
let lastLook = 0;

function set(patch: Partial<Updater>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useUpdater(): Updater {
  return useSyncExternalStore(subscribe, () => state);
}

/** Asks GitHub for a newer version. One look at a time. */
export async function look() {
  if (!isDesktop || state.looking || installing) return;
  lastLook = Date.now();
  set({ looking: true });
  try {
    const found = await check();
    if (installing) {
      void found?.close().catch(() => {});
      set({ looking: false });
      return;
    }
    // Every look hands back a new handle, even for the same version: the old one is let go.
    if (state.update) void state.update.close().catch(() => {});
    set({ update: found, looking: false, lookedAt: Date.now(), failed: false });
  } catch {
    set({ looking: false, failed: true });
  }
}

export async function install() {
  const { update } = state;
  if (!update || installing) return;
  installing = true;
  set({ percent: 0, error: null });
  try {
    let had = 0;
    let total = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      if (event.event === "Progress") {
        had += event.data.chunkLength;
        if (total) set({ percent: (had / total) * 100 });
      }
    });
    await relaunch();
  } catch (caught) {
    installing = false;
    set({ percent: null, error: String(caught) });
  }
}

/**
 * The looks that happen by themselves, and the menu bar's side: it offers
 * what was found and sends its Update back here. Run once, by the main window.
 */
export function keepLooking(): () => void {
  if (!isDesktop) return () => {};
  void look();
  const id = window.setInterval(() => void look(), EVERY_MS);
  const onFocus = () => {
    if (Date.now() - lastLook > STALE_MS) void look();
  };
  window.addEventListener("focus", onFocus);
  const off = on(EVENTS.update, () => void install());
  let offered: string | null = null;
  const unsubscribe = subscribe(() => {
    const version = state.update?.version ?? null;
    if (version === offered) return;
    offered = version;
    void invoke("set_update", { version });
  });
  return () => {
    window.clearInterval(id);
    window.removeEventListener("focus", onFocus);
    off();
    unsubscribe();
  };
}
