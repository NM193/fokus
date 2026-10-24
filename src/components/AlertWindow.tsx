import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { EVENTS, on, type Command, type Snapshot } from "../lib/desktop";
import type { Notice } from "../lib/notify";
import { PHASE_NAME } from "../lib/useTimer";

const send = (command: Command) => void emit(EVENTS.command, command);
const hide = () => void invoke("hide_alert");

/**
 * The end-of-phase card's own window in the Mac app (src-tauri/src/alert.rs).
 * It is made hidden when the app starts and shown when a phase ends. What it
 * says comes from the main window through the app; the timer's snapshots
 * give it the palette, and tell it when the next phase was started from
 * somewhere else, which answers it too.
 */
export function AlertWindow() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    document.documentElement.dataset.window = "alert";
    void invoke<Notice | null>("alert_notice").then((n) => n && setNotice(n));
    const offs = [
      on<Notice>(EVENTS.alert, setNotice),
      // Ask for the state only once listening, or the answer could arrive first.
      on<Snapshot>(EVENTS.state, setSnap, () => void emit(EVENTS.alertReady)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const palette = snap?.palette;
  useEffect(() => {
    if (palette) document.documentElement.dataset.palette = palette;
  }, [palette]);

  const startedElsewhere = !!notice && !notice.started && !!snap?.running && snap.phase === notice.next;
  useEffect(() => {
    if (startedElsewhere) hide();
  }, [startedElsewhere]);

  if (!notice) return null;

  const line = notice.started
    ? notice.task
      ? `Started · ${notice.task}`
      : "It has started by itself."
    : notice.task && `Next task: ${notice.task}`;

  return (
    <div className={`alert alert--${notice.next}`}>
      <span className="alert__eyebrow">{notice.ended === "focus" ? "Focus done" : "Break over"}</span>
      <p className="alert__title">
        {PHASE_NAME[notice.next]} <span className="alert__minutes">{notice.minutes} min</span>
      </p>
      {line && <span className="alert__line">{line}</span>}
      <div className="alert__actions">
        {notice.started ? (
          <button type="button" className="cta cta--small" onClick={hide}>
            OK
          </button>
        ) : (
          <>
            <button
              type="button"
              className="cta cta--small"
              onClick={() => {
                send("start");
                hide();
              }}
            >
              {notice.next === "focus" ? "Start focus" : "Start break"}
            </button>
            <button type="button" className="ghost ghost--small" onClick={hide}>
              Later
            </button>
          </>
        )}
      </div>
    </div>
  );
}
