import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings } from "./settings";
import { chime, prime } from "./sound";
import { load, save } from "./store";
import { phoneRings } from "./usePhone";

export type Phase = "focus" | "short" | "long";

type State = {
  phase: Phase;
  /** Focus blocks finished since the last long break. */
  round: number;
  /** When the running phase ends. Null while stopped. */
  endsAt: number | null;
  /** What is left of a paused phase. Null means all of it: the phase is untouched. */
  left: number | null;
  /** Start of focus time not yet handed to the session. Null when none is accruing. */
  markAt: number | null;
};

const INITIAL: State = { phase: "focus", round: 0, endsAt: null, left: null, markAt: null };
const KEY = "fokus.timer.v1";

export const PHASE_NAME: Record<Phase, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};

export function phaseLength(phase: Phase, settings: Settings): number {
  const minutes =
    phase === "focus" ? settings.focus : phase === "short" ? settings.shortBreak : settings.longBreak;
  return minutes * 60_000;
}

/** What follows a phase that has just ended, given the round it ended on. */
export function nextPhase(phase: Phase, round: number, every: number): Phase {
  if (phase !== "focus") return "focus";
  return round >= every ? "long" : "short";
}

type Hooks = {
  /** Focus time that has passed, in ms. Called on pause, skip, reset and finish. */
  onFocus: (ms: number) => void;
  /** A focus block ran to its end (or was skipped). */
  onRound: () => void;
  /** A phase ran out just now (not skipped), and `next` follows; `started` if by itself. */
  onEnd: (ended: Phase, next: Phase, started: boolean) => void;
};

export type Timer = ReturnType<typeof useTimer>;

/**
 * The timer is a deadline, not a countdown: a running phase stores when it
 * ends and the display is derived from the clock. A throttled or sleeping
 * window therefore never loses time, and a reload picks up where it was.
 *
 * Transitions read the latest state from a ref and run their side effects
 * once, outside any state updater -- StrictMode calls updaters twice.
 */
export function useTimer(settings: Settings, hooks: Hooks) {
  const [state, setState] = useState<State>(() => ({ ...INITIAL, ...load<Partial<State>>(KEY, {}) }));
  const [now, setNow] = useState(() => Date.now());
  const current = useRef(state);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const commit = useCallback((next: State) => {
    current.current = next;
    setState(next);
    save(KEY, next);
  }, []);

  /** Hand the focus time since the mark to the session and move the mark. */
  const accrue = useCallback((s: State, at: number, keepMark: boolean): State => {
    if (s.phase === "focus" && s.markAt !== null && at > s.markAt) {
      hooksRef.current.onFocus(at - s.markAt);
    }
    return { ...s, markAt: keepMark && s.phase === "focus" ? at : null };
  }, []);

  const finish = useCallback(
    (s: State, at: number, quiet: boolean): State => {
      const conf = settingsRef.current;
      let round = s.round;
      const end = Math.min(at, s.endsAt ?? at);
      s = accrue(s, end, false);

      if (s.phase === "focus") {
        round += 1;
        hooksRef.current.onRound();
      }
      const phase = nextPhase(s.phase, round, conf.every);
      if (s.phase === "long") round = 0;
      if (!quiet && conf.sound && !phoneRings(conf)) chime(conf.soundName, conf.soundVolume);
      if (!quiet) hooksRef.current.onEnd(s.phase, phase, conf.autoStart);

      if (!conf.autoStart) return { phase, round, endsAt: null, left: null, markAt: null };
      return {
        phase,
        round,
        endsAt: at + phaseLength(phase, conf),
        left: null,
        markAt: phase === "focus" ? at : null,
      };
    },
    [accrue],
  );

  const running = state.endsAt !== null;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  // A phase ends here -- including one that ended while the app was closed,
  // which is finished without a chime nobody would connect to anything.
  useEffect(() => {
    const s = current.current;
    if (s.endsAt !== null && now >= s.endsAt) {
      commit(finish(s, now, now - s.endsAt > 3000));
    }
  }, [now, commit, finish]);

  const total = phaseLength(state.phase, settings);
  const remaining = running
    ? Math.max(0, (state.endsAt ?? 0) - now)
    : Math.min(state.left ?? total, total);

  const toggle = useCallback(() => {
    const s = current.current;
    const at = Date.now();
    setNow(at);
    if (s.endsAt !== null) {
      const paused = accrue(s, at, false);
      commit({ ...paused, endsAt: null, left: Math.max(0, s.endsAt - at) });
      return;
    }
    prime();
    const length = phaseLength(s.phase, settingsRef.current);
    commit({
      ...s,
      endsAt: at + Math.min(s.left ?? length, length),
      left: null,
      markAt: s.phase === "focus" ? at : null,
    });
  }, [accrue, commit]);

  const reset = useCallback(() => {
    const s = accrue(current.current, Date.now(), false);
    commit({ ...s, endsAt: null, left: null });
  }, [accrue, commit]);

  const skip = useCallback(() => {
    const at = Date.now();
    setNow(at);
    commit(finish(current.current, at, true));
  }, [commit, finish]);

  /**
   * Read the clock now. The widget calls this from its own window, which stays
   * on screen -- and so unthrottled -- while the app's window is hidden.
   */
  const sync = useCallback(() => setNow(Date.now()), []);

  /**
   * Take the focus time accrued so far without stopping, and return it rather
   * than reporting it: a session that is ending wants it in the same breath.
   */
  const flush = useCallback((): number => {
    const s = current.current;
    if (s.endsAt === null || s.phase !== "focus" || s.markAt === null) return 0;
    const at = Date.now();
    commit({ ...s, markAt: at });
    return Math.max(0, at - s.markAt);
  }, [commit]);

  return {
    phase: state.phase,
    round: state.round,
    running,
    /** When the running phase ends, in ms since the epoch. */
    endsAt: state.endsAt,
    /** Started at some point and not reset since. */
    touched: running || state.left !== null,
    remaining,
    total,
    progress: total ? 1 - remaining / total : 0,
    /** Focus time running now that the session has not been handed yet. */
    accruing:
      running && state.phase === "focus" && state.markAt !== null
        ? Math.max(0, now - state.markAt)
        : 0,
    upNext: nextPhase(state.phase, state.round + 1, settings.every),
    toggle,
    reset,
    skip,
    flush,
    sync,
  };
}
