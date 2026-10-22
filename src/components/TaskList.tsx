import { useState, type CSSProperties, type FormEvent } from "react";
import { duration } from "../lib/format";
import type { SessionApi } from "../lib/useSession";
import { CheckIcon, CloseIcon, PlusIcon } from "./Icons";

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

export function TaskList({ session, focusing, liveMs, onEnd, summary }: Props) {
  const [draft, setDraft] = useState("");
  const nowId = focusing ? session.tasks.find((t) => !t.done)?.id : undefined;
  const focused = session.focusMs + liveMs;
  const canEnd = focused > 0 || session.done > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    session.add(draft);
    setDraft("");
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
        <ol className="task-list">
          {session.tasks.map((task, index) => (
            <li
              key={task.id}
              className="task"
              data-done={task.done ? "" : undefined}
              style={{ "--i": index } as CSSProperties}
            >
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
                className="task__remove"
                onClick={() => session.remove(task.id)}
                aria-label={`Remove ${task.title}`}
              >
                <CloseIcon size={13} />
              </button>
            </li>
          ))}
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
