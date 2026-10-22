import { useCallback, useEffect, useState } from "react";
import { load, save } from "./store";

export type Task = {
  id: string;
  title: string;
  done: boolean;
};

/** The session in progress: its tasks and the focus time spent on them. */
type Session = {
  startedAt: number;
  focusMs: number;
  rounds: number;
  tasks: Task[];
};

/** A session once it has ended. Kept, newest first, for the History screen. */
export type SessionRecord = {
  id: string;
  startedAt: number;
  endedAt: number;
  focusMs: number;
  rounds: number;
  done: number;
  total: number;
  /** Titles of the tasks finished, so a row can say what the time went into. */
  finished: string[];
};

const SESSION_KEY = "fokus.session.v1";
const HISTORY_KEY = "fokus.history.v1";

const fresh = (tasks: Task[] = []): Session => ({
  startedAt: Date.now(),
  focusMs: 0,
  rounds: 0,
  tasks,
});

const newId = () => Math.random().toString(36).slice(2, 10);

/** Completion is counted by tasks, never by time spent. */
export function percentDone(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}

export type SessionApi = ReturnType<typeof useSession>;

export function useSession() {
  const [session, setSession] = useState<Session>(() => load(SESSION_KEY, fresh()));
  const [history, setHistory] = useState<SessionRecord[]>(() => load(HISTORY_KEY, []));

  useEffect(() => save(SESSION_KEY, session), [session]);
  useEffect(() => save(HISTORY_KEY, history), [history]);

  const add = useCallback((title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setSession((s) => ({ ...s, tasks: [...s.tasks, { id: newId(), title: clean, done: false }] }));
  }, []);

  const toggle = useCallback((id: string) => {
    setSession((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  }, []);

  const remove = useCallback((id: string) => {
    setSession((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  }, []);

  /** A blank title keeps the old one: emptying a task is not how it goes. */
  const rename = useCallback((id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setSession((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, title: clean } : t)),
    }));
  }, []);

  /** Put a task at another place in the list. The first open one is "now". */
  const move = useCallback((id: string, to: number) => {
    setSession((s) => {
      const from = s.tasks.findIndex((t) => t.id === id);
      if (from < 0 || from === to) return s;
      const tasks = [...s.tasks];
      const [task] = tasks.splice(from, 1);
      tasks.splice(Math.max(0, Math.min(to, tasks.length)), 0, task);
      return { ...s, tasks };
    });
  }, []);

  const addFocus = useCallback((ms: number) => {
    setSession((s) => ({ ...s, focusMs: s.focusMs + ms }));
  }, []);

  const addRound = useCallback(() => {
    setSession((s) => ({ ...s, rounds: s.rounds + 1 }));
  }, []);

  /**
   * Close the session into History. What was finished leaves with it; what
   * was not carries over, so an unfinished list is never lost by ending.
   * `extraMs` is focus time still running on the clock when it ends.
   * Returns the record, or null when there was nothing worth keeping.
   */
  const end = useCallback((extraMs = 0): SessionRecord | null => {
    const done = session.tasks.filter((t) => t.done);
    const focusMs = session.focusMs + extraMs;
    const worth = focusMs >= 60_000 || done.length > 0;
    const record: SessionRecord = {
      id: newId(),
      startedAt: session.startedAt,
      endedAt: Date.now(),
      focusMs,
      rounds: session.rounds,
      done: done.length,
      total: session.tasks.length,
      finished: done.map((t) => t.title),
    };
    if (worth) setHistory((h) => [record, ...h]);
    setSession(fresh(session.tasks.filter((t) => !t.done)));
    return worth ? record : null;
  }, [session]);

  const clearHistory = useCallback(() => setHistory([]), []);

  const done = session.tasks.filter((t) => t.done).length;

  return {
    tasks: session.tasks,
    startedAt: session.startedAt,
    focusMs: session.focusMs,
    rounds: session.rounds,
    done,
    total: session.tasks.length,
    percent: percentDone(done, session.tasks.length),
    history,
    add,
    toggle,
    remove,
    rename,
    move,
    addFocus,
    addRound,
    end,
    clearHistory,
  };
}
