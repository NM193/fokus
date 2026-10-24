import { duration } from "../lib/format";
import type { Settings } from "../lib/settings";

/**
 * One round, drawn to scale: what the four lengths add up to, so "long
 * break after 4" reads as what it does. Under the lengths in Settings, and
 * in the guide.
 */
export function Round({ settings }: { settings: Settings }) {
  const { focus, shortBreak, longBreak, every } = settings;
  const parts: { kind: "focus" | "short" | "long"; minutes: number }[] = [];
  for (let i = 0; i < every; i++) {
    parts.push({ kind: "focus", minutes: focus });
    parts.push(i < every - 1 ? { kind: "short", minutes: shortBreak } : { kind: "long", minutes: longBreak });
  }
  const total = every * focus + (every - 1) * shortBreak + longBreak;

  return (
    <div className="round">
      <div className="round__bar" aria-hidden="true">
        {parts.map((p, i) => (
          <i key={i} data-kind={p.kind} style={{ flexGrow: p.minutes }} />
        ))}
      </div>
      <p className="round__sum">
        One round: {every} × {focus} min focus
        {every > 1 && `, ${every - 1} × ${shortBreak} min short break`}, then {longBreak} min long break.{" "}
        <b>{duration(total * 60_000)}</b>, then it starts over.
      </p>
    </div>
  );
}
