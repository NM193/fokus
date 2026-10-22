import { useEffect, useState, type ReactNode } from "react";
import { isDesktop } from "../lib/desktop";
import {
  EVERY_OPTIONS,
  FOCUS_OPTIONS,
  LONG_OPTIONS,
  SHORT_OPTIONS,
  type Palette,
  type Settings,
  type Surface,
} from "../lib/settings";

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  historyCount: number;
  onClearHistory: () => void;
};

const PALETTES: { value: Palette; label: string; swatch: string[] }[] = [
  { value: "lavender", label: "Lavender", swatch: ["#F8F4EF", "#E7DDF1", "#C4B4D6", "#8C7AA9"] },
  { value: "sage", label: "Sage", swatch: ["#FAF6EF", "#DCE6D8", "#AEC3A7", "#728E76"] },
  { value: "rose", label: "Rose", swatch: ["#FFF8F2", "#F7DBD3", "#DDB8BC", "#A17F8E"] },
];

const minutes = (values: number[]) => values.map((v) => ({ value: v, label: `${v}` }));

export function SettingsView({ settings, update, historyCount, onClearHistory }: Props) {
  return (
    <>
      <h1 className="title">Settings</h1>
      <p className="lede">Set once, forget. The lengths can also be changed right under the timer.</p>

      <div className="section">
        <h2>Appearance</h2>
        <Setting title="Palette" hint="Three soft palettes. Each has one accent for the ring and the ticks.">
          <div className="segmented" role="radiogroup" aria-label="Palette">
            {PALETTES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={settings.palette === p.value}
                onClick={() => update({ palette: p.value })}
              >
                <span className="swatch" aria-hidden="true">
                  {p.swatch.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                {p.label}
              </button>
            ))}
          </div>
        </Setting>
        {isDesktop && (
          <Setting
            title="Window"
            hint="Glass lets your desktop show through, softly blurred under the palette. Solid is plain paper."
          >
            <Segmented<Surface>
              label="Window"
              value={settings.surface}
              options={[
                { value: "glass", label: "Glass" },
                { value: "solid", label: "Solid" },
              ]}
              onChange={(surface) => update({ surface })}
            />
          </Setting>
        )}
      </div>

      <div className="section">
        <h2>Timer · minutes</h2>
        <Setting title="Focus" hint="One block of work.">
          <Segmented
            label="Focus"
            value={settings.focus}
            options={minutes(FOCUS_OPTIONS)}
            onChange={(focus) => update({ focus })}
          />
        </Setting>
        <Setting title="Short break" hint="Between focus blocks.">
          <Segmented
            label="Short break"
            value={settings.shortBreak}
            options={minutes(SHORT_OPTIONS)}
            onChange={(shortBreak) => update({ shortBreak })}
          />
        </Setting>
        <Setting title="Long break" hint="After a full round of blocks.">
          <Segmented
            label="Long break"
            value={settings.longBreak}
            options={minutes(LONG_OPTIONS)}
            onChange={(longBreak) => update({ longBreak })}
          />
        </Setting>
        <Setting title="Long break every" hint="How many focus blocks make a round.">
          <Segmented
            label="Long break every"
            value={settings.every}
            options={EVERY_OPTIONS.map((v) => ({ value: v, label: `${v}` }))}
            onChange={(every) => update({ every })}
          />
        </Setting>
      </div>

      <div className="section">
        <h2>Behaviour</h2>
        <Setting title="Start the next phase by itself" hint="Otherwise the timer waits for you after every block and break.">
          <Switch label="Auto-start" on={settings.autoStart} onChange={(autoStart) => update({ autoStart })} />
        </Setting>
        <Setting title="Chime" hint="A soft two-note sound when a phase ends.">
          <Switch label="Chime" on={settings.sound} onChange={(sound) => update({ sound })} />
        </Setting>
      </div>

      <div className="section">
        <h2>Data</h2>
        <Setting
          title="History"
          hint={`${historyCount} ${historyCount === 1 ? "session" : "sessions"} kept on this Mac.`}
        >
          <ConfirmButton disabled={historyCount === 0} onConfirm={onClearHistory}>
            Clear history
          </ConfirmButton>
        </Setting>
      </div>
    </>
  );
}

function Setting({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting__text">
        <b>{title}</b>
        <span>{hint}</span>
      </div>
      <div className="setting__control">{children}</div>
    </div>
  );
}

type SegmentedProps<T> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

/**
 * Asks by changing its own label instead of opening a dialog: the first click
 * arms it, a second within a few seconds does it.
 */
function ConfirmButton({
  disabled,
  onConfirm,
  children,
}: {
  disabled: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  return (
    <button
      type="button"
      className={`ghost ghost--small ${armed ? "ghost--armed" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? "Click again to clear" : children}
    </button>
  );
}
