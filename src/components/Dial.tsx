import { clock } from "../lib/format";
import {
  FOCUS_OPTIONS,
  LONG_OPTIONS,
  SHORT_OPTIONS,
  type Settings,
} from "../lib/settings";
import { PHASE_NAME, type Timer } from "../lib/useTimer";
import { MinusIcon, PauseIcon, PlayIcon, PlusIcon, ResetIcon, SkipIcon } from "./Icons";
import { Ring } from "./Ring";

type Props = {
  timer: Timer;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
};

/** The timer: a ring that fills as the phase passes, and its three controls. */
export function Dial({ timer, settings, update }: Props) {
  const cta = timer.running ? "Pause" : timer.touched ? "Resume" : "Start";
  // The round in progress during focus; the rounds already done during a break.
  const shown = timer.phase === "focus" ? timer.round + 1 : timer.round || settings.every;

  return (
    <section className={`dial dial--${timer.phase}`} data-running={timer.running ? "" : undefined}>
      <span className="eyebrow">
        Round {Math.min(shown, settings.every)} of {settings.every}
      </span>

      <div className="dial__face">
        <Ring className="dial__ring" progress={timer.progress} />
        <div className="dial__read">
          <span className="dial__phase">{PHASE_NAME[timer.phase]}</span>
          <span className="dial__time" role="timer" aria-live="off">
            {clock(timer.remaining)}
          </span>
          <span className="dial__next">Next · {PHASE_NAME[timer.upNext]}</span>
        </div>
      </div>

      <div className="dial__rounds" aria-hidden="true">
        {Array.from({ length: settings.every }, (_, i) => (
          <i
            key={i}
            data-done={i < timer.round ? "" : undefined}
            data-now={timer.phase === "focus" && i === timer.round ? "" : undefined}
          />
        ))}
      </div>

      <div className="dial__controls">
        <button
          type="button"
          className="round-button"
          onClick={timer.reset}
          disabled={!timer.touched}
          aria-label="Reset this phase"
          title="Reset"
        >
          <ResetIcon size={16} />
        </button>
        <button type="button" className="cta cta--timer" onClick={timer.toggle}>
          {timer.running ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
          {cta}
        </button>
        <button
          type="button"
          className="round-button"
          onClick={timer.skip}
          aria-label="Skip to the next phase"
          title="Skip"
        >
          <SkipIcon size={16} />
        </button>
      </div>

      <div className="lengths">
        <Stepper
          label="Focus"
          value={settings.focus}
          options={FOCUS_OPTIONS}
          onChange={(focus) => update({ focus })}
        />
        <Stepper
          label="Break"
          value={settings.shortBreak}
          options={SHORT_OPTIONS}
          onChange={(shortBreak) => update({ shortBreak })}
        />
        <Stepper
          label="Long"
          value={settings.longBreak}
          options={LONG_OPTIONS}
          onChange={(longBreak) => update({ longBreak })}
        />
      </div>
    </section>
  );
}

type StepperProps = {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
};

/**
 * Steps through a fixed list of lengths. A value that is not in the list (an
 * old setting) steps to its nearest neighbour rather than getting stuck.
 */
function Stepper({ label, value, options, onChange }: StepperProps) {
  const lower = [...options].reverse().find((o) => o < value);
  const higher = options.find((o) => o > value);

  return (
    <div className="stepper">
      <span className="stepper__label">{label}</span>
      <span className="stepper__row">
        <button
          type="button"
          disabled={lower === undefined}
          onClick={() => lower !== undefined && onChange(lower)}
          aria-label={`Shorter ${label.toLowerCase()}`}
        >
          <MinusIcon size={12} />
        </button>
        <b>
          {value}
          <small>min</small>
        </b>
        <button
          type="button"
          disabled={higher === undefined}
          onClick={() => higher !== undefined && onChange(higher)}
          aria-label={`Longer ${label.toLowerCase()}`}
        >
          <PlusIcon size={12} />
        </button>
      </span>
    </div>
  );
}
