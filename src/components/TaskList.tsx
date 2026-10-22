import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { duration } from "../lib/format";
import type { SessionApi, Task } from "../lib/useSession";
import { CheckIcon, CloseIcon, GripIcon, PencilIcon, PlusIcon } from "./Icons";

type Props = {
  session: SessionApi;
  /** The timer is running a focus block, so the first open task is "now". */
  focusing: boolean;
  /** Focus time on the clock right now, not yet in the session's total. */
  liveMs: number;
  onEnd: () => void;
  /** What the last ended session came to, shown once under the score. */
  summary: string | null;
};

/** A row held by its handle: where it was, and where it would land now. */
type Drag = {
  id: string;
  from: number;
  to: number;
  /** How far the pointer has moved since it took hold, in px. */
  dy: number;
  startY: number;
  /** Every row's vertical centre when the drag began. */
  mids: number[];
  height: number;
};

/** The slot whose centre the held row's centre has passed. */
function landing(drag: Drag, dy: number): number {
  const centre = drag.mids[drag.from] + dy;
  let to = drag.from;
  while (to < drag.mids.length - 1 && centre > drag.mids[to + 1]) to++;
  while (to > 0 && centre < drag.mids[to - 1]) to--;
  return to;
}

/** The held row follows the pointer; the rows it passes step aside. */
function shift(drag: Drag | null, index: number): number {
  if (!drag) return 0;
  if (index === drag.from) return drag.dy;
  if (drag.from < index && index <= drag.to) return -drag.height;
  if (drag.to <= index && index < drag.from) return drag.height;
  return 0;
}

export function TaskList({ session, focusing, liveMs, onEnd, summary }: Props) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const cancelled = useRef(false);
  /**
   * Rows that have arrived for good: once one is moved or renamed it stays
   * put, since a moved row (and a swapped part) would replay its entrance.
   */
  const still = useRef(new Set<string>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const list = useRef<HTMLOListElement>(null);
  /** A control to hand focus back to once the list has re-rendered. */
  const refocus = useRef<string | null>(null);
  const nowId = focusing ? session.tasks.find((t) => !t.done)?.id : undefined;
  const focused = session.focusMs + liveMs;
  const canEnd = focused > 0 || session.done > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    session.add(draft);
    setDraft("");
  }

  useEffect(() => {
    if (!refocus.current) return;
    list.current?.querySelector<HTMLElement>(refocus.current)?.focus();
    refocus.current = null;
  });

  function startEdit(task: Task) {
    still.current.add(task.id);
    cancelled.current = false;
    setEditing({ id: task.id, title: task.title });
  }

  /** Enter or a click elsewhere keeps the new title; Escape keeps the old. */
  function finishEdit() {
    if (editing && !cancelled.current) session.rename(editing.id, editing.title);
    // The blur that follows Enter, or Escape, must not save again.
    cancelled.current = true;
    setEditing(null);
  }

  function editKey(event: KeyboardEvent<HTMLInputElement>, id: string) {
    if (event.key !== "Escape") return;
    cancelled.current = true;
    setEditing(null);
    refocus.current = `[data-id="${id}"] .task__main`;
  }

  function grab(event: PointerEvent<HTMLButtonElement>, id: string, index: number) {
    if (event.button !== 0 || !list.current) return;
    const rects = Array.from(list.current.children, (row) => row.getBoundingClientRect());
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      from: index,
      to: index,
      dy: 0,
      startY: event.clientY,
      mids: rects.map((r) => r.top + r.height / 2),
      height: rects[index].height,
    });
  }

  function follow(event: PointerEvent<HTMLButtonElement>) {
    const y = event.clientY;
    setDrag((d) => d && { ...d, dy: y - d.startY, to: landing(d, y - d.startY) });
  }

  /** Move a task, and keep every row still while the list rearranges. */
  function move(id: string, to: number) {
    session.tasks.forEach((t) => still.current.add(t.id));
    session.move(id, to);
  }

  function drop() {
    if (drag && drag.to !== drag.from) move(drag.id, drag.to);
    setDrag(null);
  }

  /** The handle moves its row with the arrow keys too. */
  function nudge(event: KeyboardEvent<HTMLButtonElement>, id: string, index: number) {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    move(id, index + step);
    refocus.current = `[data-id="${id}"] .task__grip`;
  }

  return (
    <section className="tasks">
      <header className="tasks__head">
        <h2 className="eyebrow">This session</h2>
        <span className="tasks__count">
          {session.done} / {session.total} done
        </span>
      </header>

      <form className="field" onSubmit={submit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a task…"
          aria-label="New task"
        />
        <button type="submit" className="icon-button" disabled={!draft.trim()}>
          <PlusIcon size={14} />
          Add
        </button>
      </form>

      {session.tasks.length === 0 ? (
        <p className="tasks__empty">Nothing here yet. Write down what this session is for.</p>
      ) : (
        <ol ref={list} className="task-list" data-dragging={drag ? "" : undefined}>
          {session.tasks.map((task, index) => {
            const offset = shift(drag, index);
            return (
              <li
                key={task.id}
                data-id={task.id}
                className="task"
                data-done={task.done ? "" : undefined}
                data-editing={editing?.id === task.id ? "" : undefined}
                data-still={still.current.has(task.id) ? "" : undefined}
                data-held={drag?.id === task.id ? "" : undefined}
                style={
                  { "--i": index, transform: offset ? `translateY(${offset}px)` : undefined } as CSSProperties
                }
              >
                {editing?.id === task.id ? (
                  <form
                    className="task__edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      finishEdit();
                      refocus.current = `[data-id="${task.id}"] .task__main`;
                    }}
                  >
                    <span className="tick" aria-hidden="true">
                      <CheckIcon size={12} strokeWidth={2.5} />
                    </span>
                    <input
                      autoFocus
                      value={editing.title}
                      onChange={(event) => setEditing({ id: task.id, title: event.target.value })}
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={finishEdit}
                      onKeyDown={(event) => editKey(event, task.id)}
                      aria-label="Task"
                    />
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="task__main"
                      aria-pressed={task.done}
                      onClick={() => session.toggle(task.id)}
                    >
                      <span className="tick" aria-hidden="true">
                        <CheckIcon size={12} strokeWidth={2.5} />
                      </span>
                      <span className="task__title">{task.title}</span>
                    </button>
                    {task.id === nowId && <span className="task__now">Now</span>}
                    <button
                      type="button"
                      className="task__action"
                      onClick={() => startEdit(task)}
                      aria-label={`Rename ${task.title}`}
                    >
                      <PencilIcon size={13} />
                    </button>
                    <button
                      type="button"
                      className="task__action"
                      onClick={() => session.remove(task.id)}
                      aria-label={`Remove ${task.title}`}
                    >
                      <CloseIcon size={13} />
                    </button>
                    {session.tasks.length > 1 && (
                      <button
                        type="button"
                        className="task__action task__grip"
                        aria-label={`Move ${task.title}, with the arrow keys`}
                        onPointerDown={(event) => grab(event, task.id, index)}
                        onPointerMove={follow}
                        onPointerUp={drop}
                        onPointerCancel={() => setDrag(null)}
                        onKeyDown={(event) => nudge(event, task.id, index)}
                      >
                        <GripIcon size={14} />
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="score">
        <div className="score__top">
          <div>
            <span className="eyebrow">Completed</span>
            <b className="score__value">
              {session.percent}
              <small>%</small>
            </b>
          </div>
          <button type="button" className="ghost ghost--small" onClick={onEnd} disabled={!canEnd}>
            End session
          </button>
        </div>
        <div
          className="meter"
          role="progressbar"
          aria-label="Tasks completed"
          aria-valuenow={session.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${session.percent}%` }} />
        </div>
        <span className="score__caption">
          {session.done} of {session.total} tasks · {duration(focused)} focused
          {session.rounds > 0 && ` · ${session.rounds} ${session.rounds === 1 ? "round" : "rounds"}`}
        </span>
        {summary && <p className="notice">{summary}</p>}
      </div>
    </section>
  );
}
