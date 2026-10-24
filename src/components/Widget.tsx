import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isDesktop } from "../lib/desktop";
import { clock } from "../lib/format";
import type { Settings } from "../lib/settings";
import { PHASE_NAME, type Phase } from "../lib/useTimer";
import { CloseIcon, PauseIcon, PlayIcon, SkipIcon } from "./Icons";
import { Ring } from "./Ring";

/** How the widget is drawn: Settings → Mini timer. */
export type WidgetLook = {
  /** Medium is 1. Everything in the widget is in rem, so this scales it all. */
  scale: number;
  /** Only the time, until the pointer is over it. */
  peek: boolean;
  phase: boolean;
  line: boolean;
  toggle: boolean;
  skip: boolean;
};

const SCALE = { small: 0.85, medium: 1, large: 1.25 } as const;

export function widgetLook(settings: Settings): WidgetLook {
  return {
    scale: SCALE[settings.widgetSize],
    peek: settings.widgetPeek,
    phase: settings.widgetPhase,
    line: settings.widgetLine,
    toggle: settings.widgetToggle,
    skip: settings.widgetSkip,
  };
}

/**
 * The window the widget fits, in px. Mirrors the rem sizes of .widget__glass,
 * __toggle, __read and __skip in styles.css: change both.
 */
export function widgetBox(look: WidgetLook): { width: number; height: number } {
  const read = look.line ? 7 : look.phase ? 5 : 4.25;
  const width = 1.5 + (look.toggle ? 3.25 + 0.75 : 0) + read + (look.skip ? 0.75 + 1.75 : 0);
  const text = 1.85 + (look.phase ? 0.75 : 0) + (look.line ? 0.95 : 0);
  const height = Math.max(look.toggle ? 4.5 : 0, text + 0.9);
  const rem = 16 * look.scale;
  return { width: Math.round(width * rem), height: Math.round(height * rem) };
}

/** The window for the time alone (`peek`): .widget__time in the glass's padding. */
export function widgetIdleBox(look: WidgetLook): { width: number; height: number } {
  const rem = 16 * look.scale;
  return { width: Math.round((1.5 + 4.25) * rem), height: Math.round((1.85 + 0.9) * rem) };
}

/** The Mac app's widget window as it stands: `Place` in src-tauri/src/widget.rs. */
export type WidgetPlace = {
  /** The pointer is over it. */
  over: boolean;
  /** The corner it grows from and shrinks back to. */
  right: boolean;
  top: boolean;
};

type Props = {
  look: WidgetLook;
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
  /**
   * Only in the Mac app, whose window grows and shrinks around the widget and
   * gets no hover while another app is in front: the app says instead.
   */
  place?: WidgetPlace;
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
 *
 * With only the time (`peek`), everything else is still laid out, just
 * hidden: when the pointer comes it fades in and the time glides to its place
 * among it, so nothing jumps. In the Mac app the page is always the full
 * size, pinned to the corner the window grows from (widget.rs), and the window
 * only uncovers it.
 */
export function Widget({ look, phase, running, remaining, progress, line, onToggle, onSkip, onTick, onClose, place, win }: Props) {
  const [pointer, setPointer] = useState(false);
  const over = place ? place.over : pointer;
  const idle = look.peek && !over;
  const time = clock(remaining);

  // Before anything is measured: every size in the widget hangs off it.
  useLayoutEffect(() => {
    win.document.documentElement.style.fontSize = `${16 * look.scale}px`;
  }, [win, look.scale]);

  // Where the time sits alone: the middle of the small window (Mac), or of
  // the widget (browser, whose window keeps its size). Written straight onto
  // the element after every render, never kept as state: a layout effect
  // that sets state re-renders, and React does not always stop at an equal
  // value -- it looped, and threw the widget away.
  const bodyRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const right = place?.right ?? true;
  const top = place?.top ?? true;
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const read = timeRef.current;
    if (!body || !read) return;
    const alone = place ? widgetIdleBox(look) : { width: body.offsetWidth, height: body.offsetHeight };
    const cx = right ? body.offsetWidth - alone.width / 2 : alone.width / 2;
    const cy = top ? alone.height / 2 : body.offsetHeight - alone.height / 2;
    read.style.setProperty("--x", `${Math.round(cx - (read.offsetLeft + read.offsetWidth / 2))}px`);
    read.style.setProperty("--y", `${Math.round(cy - (read.offsetTop + read.offsetHeight / 2))}px`);
  });

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
    <div
      className={`widget widget--${phase}`}
      data-running={running ? "" : undefined}
      data-peek={look.peek ? "" : undefined}
      data-over={over ? "" : undefined}
      data-idle={idle ? "" : undefined}
      onMouseEnter={() => setPointer(true)}
      onMouseLeave={() => setPointer(false)}
    >
      {/* The glass is what you drag the Mac app's widget window by. */}
      <div className="widget__glass" data-tauri-drag-region={isDesktop ? "" : undefined}>
        <div ref={bodyRef} className="widget__body" data-tauri-drag-region={isDesktop ? "" : undefined}>
          {look.toggle && (
            <button
              type="button"
              className="widget__toggle widget__more"
              onClick={onToggle}
              aria-label={running ? "Pause" : "Start"}
              tabIndex={idle ? -1 : undefined}
            >
              <Ring className="widget__ring" progress={progress} stroke={16} />
              <span className="widget__icon">
                {running ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
              </span>
            </button>
          )}

          <div className="widget__read">
            {look.phase && <span className="widget__phase widget__more">{PHASE_NAME[phase]}</span>}
            <span ref={timeRef} className="widget__time" role="timer">
              {time}
            </span>
            {look.line && <span className="widget__line widget__more">{line}</span>}
          </div>

          {look.skip && (
            <button
              type="button"
              className="round-button widget__skip widget__more"
              onClick={onSkip}
              aria-label="Skip to the next phase"
              title="Skip"
              tabIndex={idle ? -1 : undefined}
            >
              <SkipIcon size={12} />
            </button>
          )}
        </div>

        {onClose && (
          <button type="button" className="widget__close" onClick={onClose} aria-label="Close mini timer">
            <CloseIcon size={8} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
