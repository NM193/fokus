import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { EVENTS, on, type Command, type Snapshot } from "../lib/desktop";
import { Widget, widgetLine, type WidgetPlace } from "./Widget";

const send = (command: Command) => void emit(EVENTS.command, command);

/** Where widget.rs opens it: top right, the pointer elsewhere. */
const HOME: WidgetPlace = { over: false, right: true, top: true };

/**
 * The whole of the mini timer's own window in the Mac app. It owns no timer:
 * the main window sends a snapshot whenever something changes, and the time
 * left is counted down here from `endsAt`.
 */
export function WidgetWindow() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [place, setPlace] = useState(HOME);
  const tick = useCallback(() => setNow(Date.now()), []);

  useEffect(() => {
    document.documentElement.dataset.window = "widget";
    // Ask for the state only once listening, or the answer could arrive first.
    return on<Snapshot>(EVENTS.state, setSnap, () => void emit(EVENTS.widgetReady));
  }, []);

  useEffect(() => on<WidgetPlace>(EVENTS.widgetPlace, setPlace), []);

  const palette = snap?.palette;
  useEffect(() => {
    if (palette) document.documentElement.dataset.palette = palette;
  }, [palette]);

  if (!snap) return null;

  const remaining = snap.endsAt !== null ? Math.max(0, snap.endsAt - now) : snap.left;

  return (
    <Widget
      look={snap.look}
      phase={snap.phase}
      running={snap.running}
      remaining={remaining}
      progress={snap.total ? 1 - remaining / snap.total : 0}
      line={widgetLine(snap.phase, snap.upNext, snap.current)}
      onToggle={() => send("toggle")}
      onSkip={() => send("skip")}
      onTick={tick}
      onClose={() => void invoke("toggle_widget")}
      place={place}
      win={window}
    />
  );
}
