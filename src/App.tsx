import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dial } from "./components/Dial";
import { Guide, guideSeen, markGuideSeen } from "./components/Guide";
import { HistoryView } from "./components/HistoryView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type Status, type View } from "./components/Sidebar";
import { TaskList } from "./components/TaskList";
import { Widget, widgetBox, widgetLine, widgetLook } from "./components/Widget";
import { isDesktop } from "./lib/desktop";
import { clock, duration } from "./lib/format";
import { card, flash, phaseEnded, tell } from "./lib/notify";
import { loadSettings, saveSettings, type Settings } from "./lib/settings";
import { useDesktop } from "./lib/useDesktop";
import { usePhone } from "./lib/usePhone";
import { useSession } from "./lib/useSession";
import { PHASE_NAME, phaseLength, useTimer, type Timer } from "./lib/useTimer";
import { useWidget } from "./lib/useWidget";

const TITLES = {
  focus: ["Focus", "time"],
  short: ["Short", "break"],
  long: ["Long", "break"],
} as const;

function status(timer: Timer, current: string | undefined): Status {
  const left = `${clock(timer.remaining)} left`;
  if (timer.running && timer.phase === "focus") {
    return { tone: "live", title: "Focusing", caption: current ? `${left} · ${current}` : left };
  }
  if (timer.running) return { tone: "rest", title: PHASE_NAME[timer.phase], caption: left };
  if (timer.touched) return { tone: "idle", title: "Paused", caption: left };
  return { tone: "idle", title: "Ready", caption: `${PHASE_NAME[timer.phase]} · ${clock(timer.total)}` };
}

export default function App() {
  const [view, setView] = useState<View>("focus");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [summary, setSummary] = useState<string | null>(null);
  // The first launch here opens the guide; Settings → Help opens it again.
  const [guide, setGuide] = useState(() => !guideSeen());
  const session = useSession();
  const current = session.tasks.find((t) => !t.done)?.title;
  const timer = useTimer(settings, {
    onFocus: session.addFocus,
    onRound: session.addRound,
    onEnd: (ended, next, started) => {
      const minutes = phaseLength(next, settings) / 60_000;
      flash(settings.effect, settings.palette);
      if (settings.alert) void card({ ended, next, minutes, started, task: next === "focus" ? current ?? null : null });
      if (!settings.notify) return;
      const { title, body } = phaseEnded(ended, next, minutes, started, current);
      void tell(title, body);
    },
  });
  const look = widgetLook(settings);
  const widget = useWidget(settings.palette, widgetBox(look));

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.palette = settings.palette;
  }, [settings.palette]);

  // Glass needs a window macOS can see through, so a browser tab stays solid.
  useEffect(() => {
    document.documentElement.dataset.surface = isDesktop ? settings.surface : "solid";
  }, [settings.surface]);

  useDesktop(timer, current, settings);
  usePhone(timer, current, settings);

  // The time shows in the window title and the Dock's window menu while it runs.
  useEffect(() => {
    document.title = timer.running ? `${clock(timer.remaining)} · ${PHASE_NAME[timer.phase]}` : "Fokus";
  }, [timer.running, timer.remaining, timer.phase]);

  // Space starts and pauses, unless the key belongs to something focused.
  const toggle = timer.toggle;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, button, [contenteditable], dialog")) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useEffect(() => {
    if (!summary) return;
    const id = window.setTimeout(() => setSummary(null), 8000);
    return () => window.clearTimeout(id);
  }, [summary]);

  function endSession() {
    const record = session.end(timer.flush());
    setSummary(
      record
        ? `Saved to History: ${duration(record.focusMs)} focused, ${record.done} of ${record.total} tasks done.`
        : "Nothing to save yet, so the session just started over.",
    );
  }

  const [lead, rest] = TITLES[timer.phase];
  const now = status(timer, current);

  return (
    <div className="app">
      {/* The window has no title bar; this strip is what it is dragged by. */}
      {isDesktop && <div className="drag-strip" data-tauri-drag-region="" />}

      <Sidebar
        view={view}
        onNavigate={setView}
        status={now}
        widget={{ supported: widget.supported, open: widget.open, onToggle: widget.toggle }}
      />

      {widget.window &&
        createPortal(
          <Widget
            look={look}
            phase={timer.phase}
            running={timer.running}
            remaining={timer.remaining}
            progress={timer.progress}
            line={widgetLine(timer.phase, timer.upNext, current)}
            onToggle={timer.toggle}
            onSkip={timer.skip}
            onTick={timer.sync}
            win={widget.window}
          />,
          widget.window.document.body,
        )}

      {/* On a phone the sidebar is the bar along the bottom; this says what its status says. */}
      <header className="topline">
        <b>Fokus</b>
        <span className={`topline__status topline__status--${now.tone}`}>{now.title}</span>
      </header>

      <main className="stage" key={view}>
        {view === "focus" && (
          <>
            <h1 className="title">
              {lead} <em>{rest}</em>
            </h1>
            <p className="lede">
              {timer.phase === "focus"
                ? "One thing at a time. Tick tasks off as you go — the session counts what you finish, not the minutes."
                : "Step away from the screen for a moment. The next block starts when you do."}
            </p>
            <div className="focus">
              <Dial timer={timer} settings={settings} update={update} />
              <TaskList
                session={session}
                focusing={timer.running && timer.phase === "focus"}
                liveMs={timer.accruing}
                onEnd={endSession}
                summary={summary}
                notes={settings.notes}
              />
            </div>
          </>
        )}

        {view === "history" && <HistoryView history={session.history} />}

        {view === "settings" && (
          <SettingsView
            settings={settings}
            update={update}
            historyCount={session.history.length}
            onClearHistory={session.clearHistory}
            onShowGuide={() => setGuide(true)}
          />
        )}
      </main>

      {guide && (
        <Guide
          settings={settings}
          onClose={() => {
            markGuideSeen();
            setGuide(false);
          }}
        />
      )}
    </div>
  );
}
