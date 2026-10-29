import { useLayoutEffect, useRef, type ReactNode } from "react";
import { HistoryIcon, SettingsIcon, TimerIcon, WidgetIcon } from "./Icons";
import { UpdateNotice } from "./UpdateNotice";

export type View = "focus" | "history" | "settings";

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: "focus", label: "Focus", icon: <TimerIcon size={16} /> },
  { id: "history", label: "History", icon: <HistoryIcon size={16} /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon size={16} /> },
];

export type Status = {
  tone: "idle" | "live" | "rest";
  title: string;
  caption: string;
};

type Props = {
  view: View;
  onNavigate: (view: View) => void;
  status: Status;
  widget: {
    supported: boolean;
    open: boolean;
    onToggle: () => void;
  };
};

function rows(onNavigate?: (view: View) => void) {
  return NAV.map((item) => (
    <button
      key={item.id}
      type="button"
      data-nav={item.id}
      tabIndex={onNavigate ? undefined : -1}
      onClick={onNavigate ? () => onNavigate(item.id) : undefined}
    >
      {item.icon}
      {item.label}
    </button>
  ));
}

/**
 * The window's only navigation, taken from Tzz.
 *
 * The selected row is a pill that slides, and it carries a darker copy of the
 * whole list moving the opposite way -- so the text under it changes colour
 * exactly where the pill covers it, mid-slide included. The copy is `inert`,
 * so Tab and a screen reader never reach the duplicate.
 */
export function Sidebar({ view, onNavigate, status, widget }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const box = wrap.current;
    const light = pill.current;
    const dark = copy.current;
    if (!box || !light || !dark) return;

    // Down the sidebar, or across the bar a phone has along the bottom.
    function place(instant: boolean) {
      const button = box!.querySelector<HTMLElement>(`[data-nav="${view}"]`);
      if (!button || !light || !dark) return;
      const at = button.getBoundingClientRect();
      const from = box!.getBoundingClientRect();
      const x = at.left - from.left;
      const y = at.top - from.top;
      if (instant) {
        light.style.transition = "none";
        dark.style.transition = "none";
      }
      light.style.transform = `translate(${x}px, ${y}px)`;
      light.style.width = `${button.offsetWidth}px`;
      light.style.height = `${button.offsetHeight}px`;
      dark.style.transform = `translate(${-x}px, ${-y}px)`;
      dark.style.width = `${box!.offsetWidth}px`;
      if (instant) {
        void light.offsetHeight;
        light.style.transition = "";
        dark.style.transition = "";
      }
    }

    // The first placement must not slide in from the top of the list.
    place(!placed.current);
    placed.current = true;

    // A window resized across the phone's width turns the list on its side.
    // Only a real change of size: the observer also reports once on its own,
    // which would cut short the slide this view change just began.
    let size = `${box.offsetWidth}x${box.offsetHeight}`;
    const watch = new ResizeObserver(() => {
      const now = `${box.offsetWidth}x${box.offsetHeight}`;
      if (now === size) return;
      size = now;
      place(true);
    });
    watch.observe(box);
    return () => watch.disconnect();
  }, [view]);

  return (
    <aside className="side" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <b>Fokus</b>
        <span>Focus space</span>
      </div>

      <div className="nav" ref={wrap}>
        <span className="nav__pill" ref={pill} aria-hidden="true">
          <span className="nav__copy" ref={copy} inert="">
            {rows()}
          </span>
        </span>
        {rows(onNavigate)}
      </div>

      <UpdateNotice />

      <button
        type="button"
        className="side__widget"
        onClick={widget.onToggle}
        disabled={!widget.supported}
        aria-pressed={widget.open}
        title={widget.supported ? undefined : "The floating timer needs Chrome or Edge."}
      >
        <WidgetIcon size={16} />
        <span>
          <b>{widget.open ? "Close mini timer" : "Mini timer"}</b>
          <small>{widget.supported ? "Floats over every app" : "Needs Chrome or Edge"}</small>
        </span>
      </button>

      <div className={`status status--${status.tone}`}>
        <span className="status__dot" aria-hidden="true" />
        <span>
          <b>{status.title}</b>
          <small>{status.caption}</small>
        </span>
      </div>
    </aside>
  );
}
