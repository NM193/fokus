import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { EVENTS, isDesktop, on, type Command, type Snapshot } from "./desktop";
import type { Settings } from "./settings";
import type { Timer } from "./useTimer";

/**
 * The main window's side of the Mac app: it hands the timer to the app (the
 * menu bar clock and the end-of-phase alarm, src-tauri/src/clock.rs) and to
 * the mini timer, and takes commands from both. Does nothing in a browser.
 */
export function useDesktop(timer: Timer, current: string | undefined, settings: Settings) {
  const snapshot: Snapshot = {
    phase: timer.phase,
    running: timer.running,
    endsAt: timer.endsAt,
    // Only meaningful while stopped; zero while running so a tick changes nothing.
    left: timer.running ? 0 : timer.remaining,
    total: timer.total,
    upNext: timer.upNext,
    current: current ?? null,
    palette: settings.palette,
  };
  const key = JSON.stringify(snapshot);

  const latest = useRef(snapshot);
  latest.current = snapshot;
  const actions = useRef(timer);
  actions.current = timer;

  useEffect(() => {
    if (!isDesktop) return;
    const s = latest.current;
    void emit(EVENTS.state, s);
    // Mirrors `TimerState` in src-tauri/src/clock.rs.
    void invoke("sync_timer", {
      state: { phase: s.phase, endsAt: s.endsAt, left: s.left, touched: actions.current.touched },
    });
  }, [key]);

  useEffect(() => {
    if (!isDesktop) return;
    const offs = [
      on<Command>(EVENTS.command, (command) =>
        command === "skip" ? actions.current.skip() : actions.current.toggle(),
      ),
      on(EVENTS.due, () => actions.current.sync()),
      on(EVENTS.widgetReady, () => void emit(EVENTS.state, latest.current)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    void invoke("set_glass", { glass: settings.surface === "glass" });
  }, [settings.surface]);
}
