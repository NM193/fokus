import { useEffect } from "react";
import { isDesktop } from "../lib/desktop";
import { clock } from "../lib/format";
import { PHASE_NAME, type Phase } from "../lib/useTimer";
import { CloseIcon, PauseIcon, PlayIcon, SkipIcon } from "./Icons";
import { Ring } from "./Ring";

type Props = {
  phase: Phase;
  running: boolean;
  remaining: number;
  progress: number;
  line: string;
  onToggle: () => void;
  onSkip: () => void;
  /** Called four times a second while running, from the widget's own window. */
  onTick: () => void;
  /** Only where the widget is a window of its own with no close button. */
  onClose?: () => void;
  /** The window the widget is drawn in. */
  win: Window;
};

/** Under the time: the task you are on, or what comes next. */
export function widgetLine(phase: Phase, upNext: Phase, current: string | null | undefined): string {
  return phase === "focus" && current ? current : `Next · ${PHASE_NAME[upNext]}`;
}

/**
 * The timer at a glance: ring, time, what you are on. It only draws; where
 * the state comes from is up to the caller -- the app's own timer in the
 * browser's floating window, events in the Mac app's (WidgetWindow).
 */
export function Widget({ phase, running, remaining, progress, line, onToggle, onSkip, onTick, onClose, win }: Props) {
  // The tick comes from the widget's window. The app's window may be hidden
  // behind other apps, and a hidden window's timers are slowed right down.
  useEffect(() => {
    if (!running) return;
    const id = win.setInterval(onTick, 250);
    return () => win.clearInterval(id);
  }, [win, running, onTick]);

  // Space starts and pauses here too.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) return;
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      onToggle();
    }
    win.addEventListener("keydown", onKey);
    return () => win.removeEventListener("keydown", onKey);
  }, [win, onToggle]);

  return (
    <div className={`widget widget--${phase}`} data-running={running ? "" : undefined}>
      {/* The glass is what you drag the Mac app's widget window by. */}
      <div className="widget__glass" data-tauri-drag-region={isDesktop ? "" : undefined}>
        <button
          type="button"
          className="widget__toggle"
          onClick={onToggle}
          aria-label={running ? "Pause" : "Start"}
        >
          <Ring className="widget__ring" progress={progress} stroke={16} />
          <span className="widget__icon">
            {running ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </span>
        </button>

        <div className="widget__read">
          <span className="widget__phase">{PHASE_NAME[phase]}</span>
          <span className="widget__time" role="timer">
            {clock(remaining)}
          </span>
          <span className="widget__line">{line}</span>
        </div>

        <button
          type="button"
          className="round-button widget__skip"
          onClick={onSkip}
          aria-label="Skip to the next phase"
          title="Skip"
        >
          <SkipIcon size={14} />
        </button>

        {onClose && (
          <button type="button" className="widget__close" onClick={onClose} aria-label="Close mini timer">
            <CloseIcon size={10} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
