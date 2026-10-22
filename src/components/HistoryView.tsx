import { useMemo, type CSSProperties } from "react";
import { dayLabel, duration, startOfDay, timeLabel, weekdayLabel } from "../lib/format";
import { percentDone, type SessionRecord } from "../lib/useSession";

const DAY = 86_400_000;

type Props = {
  history: SessionRecord[];
};

/**
 * What the sessions came to. Deliberately quiet: the timer and the tasks are
 * the app, and this screen is somewhere to look back, not something to chase.
 */
export function HistoryView({ history }: Props) {
  const week = useMemo(() => {
    const today = startOfDay(Date.now());
    return Array.from({ length: 7 }, (_, i) => {
      const from = today - (6 - i) * DAY;
      const sessions = history.filter((r) => r.endedAt >= from && r.endedAt < from + DAY);
      return {
        from,
        today: i === 6,
        focusMs: sessions.reduce((sum, r) => sum + r.focusMs, 0),
        count: sessions.length,
      };
    });
  }, [history]);

  const weekSessions = history.filter((r) => r.endedAt >= week[0].from);
  const weekFocus = week.reduce((sum, d) => sum + d.focusMs, 0);
  const weekDone = weekSessions.reduce((sum, r) => sum + r.done, 0);
  const weekTotal = weekSessions.reduce((sum, r) => sum + r.total, 0);
  const tallest = Math.max(...week.map((d) => d.focusMs), 1);

  return (
    <>
      <h1 className="title">
        History <em>{history.length}</em>
      </h1>
      <p className="lede">
        Every session you end lands here: how long you focused and how much of the
        list you got through.
      </p>

      <div className="totals">
        <div>
          <span className="eyebrow">Focused this week</span>
          <b>{duration(weekFocus)}</b>
        </div>
        <div>
          <span className="eyebrow">Sessions</span>
          <b>{weekSessions.length}</b>
        </div>
        <div>
          <span className="eyebrow">Tasks done</span>
          <b>
            {weekDone}
            <small> / {weekTotal}</small>
          </b>
        </div>
      </div>

      <div className="week" aria-label="Focus time, last seven days">
        {week.map((day) => (
          <div key={day.from} className="week__day" data-today={day.today ? "" : undefined}>
            <span className="week__value">{day.focusMs ? Math.round(day.focusMs / 60000) : ""}</span>
            <span className="week__bar">
              <i style={{ "--h": day.focusMs / tallest } as CSSProperties} />
            </span>
            <span className="week__label">{weekdayLabel(day.from)}</span>
          </div>
        ))}
      </div>

      <div className="section">
        <h2>Sessions</h2>
        {history.length === 0 ? (
          <p className="notice">
            Nothing yet. End a session on the Focus screen and it shows up here.
          </p>
        ) : (
          <ol className="rows">
            {history.map((record, index) => (
              <li key={record.id} className="row" style={{ "--i": Math.min(index, 12) } as CSSProperties}>
                <div className="row__in">
                  <span className="row__n">{String(history.length - index).padStart(2, "0")}</span>
                  <span className="row__title">
                    {dayLabel(record.endedAt)} · {timeLabel(record.startedAt)}
                    <small>{record.finished.length ? record.finished.join(" · ") : "No tasks finished"}</small>
                  </span>
                  <span className="row__state">
                    {record.done}/{record.total} · {percentDone(record.done, record.total)}%
                  </span>
                  <span className="row__time">{duration(record.focusMs)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
