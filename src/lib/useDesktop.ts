import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { widgetBox, widgetIdleBox, widgetLook } from "../components/Widget";
import { EVENTS, isDesktop, isWindows, on, type Command, type Snapshot } from "./desktop";
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
    look: widgetLook(settings),
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
      on<Command>(EVENTS.command, (command) => {
        if (command === "skip") actions.current.skip();
        else if (command === "toggle" || !actions.current.running) actions.current.toggle();
      }),
      on(EVENTS.due, () => actions.current.sync()),
      on(EVENTS.widgetReady, () => void emit(EVENTS.state, latest.current)),
      on(EVENTS.alertReady, () => void emit(EVENTS.state, latest.current)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    void invoke("set_glass", { glass: settings.surface === "glass" });
  }, [settings.surface]);

  // Windows draws the title bar itself, in the colours it is given: the
  // palette's paper, ink and rim (frame.rs). App sets the palette just before.
  useEffect(() => {
    if (!isWindows) return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    void invoke("set_frame", { caption: color("--bg"), text: color("--ink"), border: color("--mid") });
  }, [settings.palette]);

  useEffect(() => {
    if (!isDesktop) return;
    void invoke("set_open_at_login", { on: settings.openAtLogin });
  }, [settings.openAtLogin]);

  // The card is made now, with the app starting, never at the end of a phase
  // (src-tauri/src/alert.rs says why).
  useEffect(() => {
    if (isDesktop && settings.alert) void invoke("prepare_alert");
  }, [settings.alert]);

  // The same for the effect that comes with the sound.
  useEffect(() => {
    if (isDesktop && settings.effect !== "none") void invoke("prepare_effect");
  }, [settings.effect]);

  // The widget draws itself from the snapshot; its window is sized to match,
  // and to the time alone while it shows only that.
  const { width, height } = widgetBox(snapshot.look);
  const idle = snapshot.look.peek ? widgetIdleBox(snapshot.look) : null;
  const idleWidth = idle?.width;
  const idleHeight = idle?.height;
  const opacity = settings.widgetOpacity;
  useEffect(() => {
    if (!isDesktop) return;
    const idle = idleWidth && idleHeight ? [idleWidth, idleHeight] : null;
    void invoke("set_widget_look", { width, height, opacity, idle });
  }, [width, height, opacity, idleWidth, idleHeight]);
}
