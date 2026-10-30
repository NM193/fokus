import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isDesktop, isPhone } from "../lib/desktop";
import { timeLabel } from "../lib/format";
import { NOTES } from "../lib/notes";
import { flash } from "../lib/notify";
import {
  EVERY_OPTIONS,
  EVERY_RANGE,
  FOCUS_OPTIONS,
  FOCUS_RANGE,
  LONG_OPTIONS,
  LONG_RANGE,
  OPACITY_OPTIONS,
  SHORT_OPTIONS,
  SHORT_RANGE,
  EFFECTS,
  SOUNDS,
  type Effect,
  type Palette,
  type Settings,
  type SoundName,
  type Surface,
  type WidgetSize,
} from "../lib/settings";
import { chime } from "../lib/sound";
import { install, look, useUpdater } from "../lib/updater";
import type { SyncApi, SyncState } from "../lib/useSync";
import { Round } from "./Round";
import { UpdateProgress } from "./UpdateNotice";

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  historyCount: number;
  onClearHistory: () => void;
  onShowGuide: () => void;
  sync: SyncApi;
};

const PALETTES: { value: Palette; label: string; swatch: string[] }[] = [
  { value: "lavender", label: "Lavender", swatch: ["#F8F4EF", "#E7DDF1", "#C4B4D6", "#8C7AA9"] },
  { value: "sage", label: "Sage", swatch: ["#FAF6EF", "#DCE6D8", "#AEC3A7", "#728E76"] },
  { value: "rose", label: "Rose", swatch: ["#FFF8F2", "#F7DBD3", "#DDB8BC", "#A17F8E"] },
];

export function SettingsView({ settings, update, historyCount, onClearHistory, onShowGuide, sync }: Props) {
  const device = isPhone ? "phone" : "Mac";
  const synced = sync.email !== null;
  // Hear what was picked, once the slider has come to rest.
  const listen = useRef<number | undefined>(undefined);
  function tryOut(sound: SoundName, volume: number) {
    window.clearTimeout(listen.current);
    listen.current = window.setTimeout(() => chime(sound, volume), 250);
  }

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
        <h2>Timer</h2>
        <Setting title="Focus · min" hint="Minutes of work in one block.">
          <Count
            label="Focus, minutes"
            value={settings.focus}
            options={FOCUS_OPTIONS}
            range={FOCUS_RANGE}
            onChange={(focus) => update({ focus })}
          />
        </Setting>
        <Setting title="Short break · min" hint="Minutes of rest after each focus block.">
          <Count
            label="Short break, minutes"
            value={settings.shortBreak}
            options={SHORT_OPTIONS}
            range={SHORT_RANGE}
            onChange={(shortBreak) => update({ shortBreak })}
          />
        </Setting>
        <Setting title="Long break · min" hint="Minutes of rest after the last block of a round, in place of the short one.">
          <Count
            label="Long break, minutes"
            value={settings.longBreak}
            options={LONG_OPTIONS}
            range={LONG_RANGE}
            onChange={(longBreak) => update({ longBreak })}
          />
        </Setting>
        <Setting
          title="Long break after · blocks"
          hint="Focus blocks in a round. After the last one comes the long break, and a new round begins."
        >
          <Count
            label="Long break after, focus blocks"
            value={settings.every}
            options={EVERY_OPTIONS}
            range={EVERY_RANGE}
            onChange={(every) => update({ every })}
          />
        </Setting>
        <Round settings={settings} />
      </div>

      <div className="section">
        <h2>Behaviour</h2>
        <Setting title="Start the next phase by itself" hint="Otherwise the timer waits for you after every block and break.">
          <Switch label="Auto-start" on={settings.autoStart} onChange={(autoStart) => update({ autoStart })} />
        </Setting>
        <Setting title="Sound" hint="Played when a phase ends.">
          <Switch label="Sound" on={settings.sound} onChange={(sound) => update({ sound })} />
        </Setting>
        {settings.sound && isDesktop && (
          <Setting title="Which sound" hint="Fokus's own two soft notes, or one of the Mac's.">
            <select
              className="select"
              aria-label="Which sound"
              value={settings.soundName}
              onChange={(event) => {
                const soundName = event.target.value as SoundName;
                update({ soundName });
                tryOut(soundName, settings.soundVolume);
              }}
            >
              {SOUNDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Setting>
        )}
        {settings.sound && (
          <Setting title="Volume" hint={`On top of the ${isPhone ? "phone" : "Mac"}'s own volume.`}>
            <span className="volume">
              <input
                type="range"
                className="range"
                aria-label="Volume"
                min={0}
                max={100}
                step={5}
                value={Math.round(settings.soundVolume * 100)}
                onChange={(event) => {
                  const soundVolume = Number(event.target.value) / 100;
                  update({ soundVolume });
                  tryOut(settings.soundName, soundVolume);
                }}
              />
              <span className="volume__value">{Math.round(settings.soundVolume * 100)}%</span>
            </span>
          </Setting>
        )}
        {isDesktop && (
          <Setting title="Effect" hint="What you see with the sound when a phase ends. Pick one to see it.">
            <Segmented<Effect>
              label="Effect"
              value={settings.effect}
              options={EFFECTS}
              onChange={(effect) => {
                update({ effect });
                flash(effect, settings.palette);
                if (effect !== "none" && settings.sound) chime(settings.soundName, settings.soundVolume);
              }}
            />
          </Setting>
        )}
        {isDesktop && (
          <Setting
            title="Card on screen"
            hint="A small card over every app, full screen ones too, when a phase ends. It stays until you answer it."
          >
            <Switch label="Card on screen" on={settings.alert} onChange={(alert) => update({ alert })} />
          </Setting>
        )}
        {(isDesktop || isPhone) && (
          <Setting
            title="Notification"
            hint={
              isPhone
                ? "A note when a phase ends, with the sound, even with the phone locked."
                : "A note on screen when a phase ends, unless Fokus is already in front."
            }
          >
            <Switch label="Notification" on={settings.notify} onChange={(notify) => update({ notify })} />
          </Setting>
        )}
      </div>

      <div className="section">
        <h2>Session</h2>
        <Setting
          wide
          title="When it is all done"
          hint={`A line under the score once every task is ticked off, a different one each session. One per line, kept ${synced ? "in your account" : `on this ${device} only`}. Left empty, Fokus says one of its own.`}
        >
          <textarea
            className="notes"
            aria-label="When it is all done"
            rows={4}
            value={settings.notes}
            placeholder={NOTES.join("\n")}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </Setting>
      </div>

      {sync.available && (
        <div className="section">
          <h2>Sync</h2>
          <Account sync={sync} />
        </div>
      )}

      {/* A phone has no window to float over: the mini timer is for a desktop. */}
      {!isPhone && (
        <div className="section">
          <h2>Mini timer</h2>
          <Setting
            title="Size"
            hint={
              isDesktop
                ? "It floats over every app, full screen ones too, so keep it as small as you like."
                : "How much room it takes over other windows."
            }
          >
            <Segmented<WidgetSize>
              label="Size"
              value={settings.widgetSize}
              options={[
                { value: "small", label: "Small" },
                { value: "medium", label: "Medium" },
                { value: "large", label: "Large" },
              ]}
              onChange={(widgetSize) => update({ widgetSize })}
            />
          </Setting>
          {isDesktop && (
            <Setting title="Opacity" hint="Lower lets what is behind it show through.">
              <Segmented
                label="Opacity"
                value={settings.widgetOpacity}
                options={OPACITY_OPTIONS.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))}
                onChange={(widgetOpacity) => update({ widgetOpacity })}
              />
            </Setting>
          )}
          <Setting title="Only the time" hint="The rest shows when the pointer is over it.">
            <Switch label="Only the time" on={settings.widgetPeek} onChange={(widgetPeek) => update({ widgetPeek })} />
          </Setting>
          <Setting title="Phase" hint="Focus, short break or long break, over the time.">
            <Switch label="Phase" on={settings.widgetPhase} onChange={(widgetPhase) => update({ widgetPhase })} />
          </Setting>
          <Setting title="Task" hint="The task you are on, or what comes next, under the time.">
            <Switch label="Task" on={settings.widgetLine} onChange={(widgetLine) => update({ widgetLine })} />
          </Setting>
          <Setting
            title="Start and pause"
            hint={
              isDesktop
                ? "The button in the ring that fills as a phase passes. Without it, ⌃⌥F still starts and pauses."
                : "The button in the ring that fills as a phase passes."
            }
          >
            <Switch
              label="Start and pause"
              on={settings.widgetToggle}
              onChange={(widgetToggle) => update({ widgetToggle })}
            />
          </Setting>
          <Setting title="Skip" hint="Straight on to the next phase.">
            <Switch label="Skip" on={settings.widgetSkip} onChange={(widgetSkip) => update({ widgetSkip })} />
          </Setting>
        </div>
      )}

      {isDesktop && (
        <div className="section">
          <h2>Mac</h2>
          <Setting title="Open at login" hint="Starts with the Mac, quietly, as the clock in the menu bar.">
            <Switch
              label="Open at login"
              on={settings.openAtLogin}
              onChange={(openAtLogin) => update({ openAtLogin })}
            />
          </Setting>
          <Setting title="Start and pause from anywhere" hint="Works in every app, with Fokus hidden.">
            <kbd className="keys" aria-label="Control Option F">
              ⌃⌥F
            </kbd>
          </Setting>
        </div>
      )}

      {isDesktop && (
        <div className="section">
          <h2>Updates</h2>
          <Version />
        </div>
      )}

      <div className="section">
        <h2>Help</h2>
        <Setting title="Guide" hint="The short tour from the first time Fokus opened.">
          <button type="button" className="ghost ghost--small" onClick={onShowGuide}>
            Show it again
          </button>
        </Setting>
      </div>

      <div className="section">
        <h2>Data</h2>
        <Setting
          title="History"
          hint={`${historyCount} ${historyCount === 1 ? "session" : "sessions"}, kept on this ${device}${synced ? " and in your account: clearing it clears it everywhere" : ""}.`}
        >
          <ConfirmButton disabled={historyCount === 0} onConfirm={onClearHistory}>
            Clear history
          </ConfirmButton>
        </Setting>
      </div>
    </>
  );
}

/** `wide` puts the control under its words, for one too big to sit beside them. */
function Setting({
  title,
  hint,
  wide,
  children,
}: {
  title: string;
  hint: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "setting setting--wide" : "setting"}>
      <div className="setting__text">
        <b>{title}</b>
        <span>{hint}</span>
      </div>
      <div className="setting__control">{children}</div>
    </div>
  );
}

/** How a signed-in device stands with the cloud, in a few words. */
function syncLine(state: SyncState): string {
  switch (state.kind) {
    case "synced":
      return `Synced at ${timeLabel(state.at)}.`;
    case "saving":
      return "Saving…";
    case "connecting":
      return "Connecting…";
    case "offline":
      return "Offline. It catches up once you are back online.";
    case "failed":
      return `Sync stopped: ${state.message}`;
    default:
      return "";
  }
}

/** Sign in once on each device; after that it just keeps up. */
function Account({ sync }: { sync: SyncApi }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(await sync.signIn(email, password));
    setBusy(false);
    setPassword("");
  }

  if (sync.email) {
    return (
      <Setting title="Your account" hint={`${sync.email}. ${syncLine(sync.state)}`}>
        <button type="button" className="ghost ghost--small" onClick={() => void sync.signOut()}>
          Sign out
        </button>
      </Setting>
    );
  }

  if (sync.state.kind === "connecting") {
    return (
      <Setting title="Your account" hint="Connecting…">
        <span />
      </Setting>
    );
  }

  return (
    <Setting
      wide
      title="Your account"
      hint="Tasks, History and the timer's lengths, the same on the Mac and the phone. Sign in on each; what is already here is kept."
    >
      <form className="signin" onSubmit={(event) => void submit(event)}>
        <input
          type="email"
          autoComplete="username"
          placeholder="Email"
          aria-label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className="cta cta--small" disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="signin__error">{error}</p>}
      </form>
    </Setting>
  );
}

/** This version, and a newer one when there is: looked for here on request, besides the looks Fokus makes by itself. */
function Version() {
  const { update, looking, lookedAt, failed, percent, error } = useUpdater();
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    void getVersion().then(setCurrent);
  }, []);

  const now = current ? `Fokus ${current}` : "Fokus";
  let hint = `${now}. It also looks for a new version by itself every few hours.`;
  if (update && percent !== null) hint = `Downloading Fokus ${update.version}. Fokus opens again once it is in.`;
  else if (update && error) hint = `Fokus ${update.version} did not go through: ${error}`;
  else if (update) hint = `${now} now. Fokus ${update.version} is out.`;
  else if (failed) hint = `${now}. GitHub could not be reached; try again in a while.`;
  else if (lookedAt) hint = `${now}, the newest. Checked at ${timeLabel(lookedAt)}.`;

  return (
    <Setting title="Version" hint={hint}>
      {update && percent !== null ? (
        <span className="setting__meter">
          <UpdateProgress percent={percent} />
        </span>
      ) : update ? (
        <button type="button" className="cta cta--small" onClick={() => void install()}>
          Install {update.version}
        </button>
      ) : (
        <button type="button" className="ghost ghost--small" disabled={looking} onClick={() => void look()}>
          {looking ? "Checking…" : "Check for updates"}
        </button>
      )}
    </Setting>
  );
}

/**
 * A length: the usual ones, or one of your own. The last button reads
 * "Custom" until a length of your own is set, then shows it; clicking it
 * opens a field (Enter or leaving it sets, Escape gives up).
 */
function Count({
  label,
  value,
  options,
  range: [min, max],
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  range: readonly [number, number];
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const own = !options.includes(value);

  function commit(text: string) {
    setEditing(false);
    const n = Math.round(Number(text));
    if (text.trim() && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
      {editing ? (
        <input
          className="segmented__field"
          type="number"
          inputMode="numeric"
          aria-label={`${label}, your own`}
          min={min}
          max={max}
          defaultValue={own ? value : ""}
          placeholder={`${min}–${max}`}
          autoFocus
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button type="button" role="radio" aria-checked={own} onClick={() => setEditing(true)}>
          {own ? value : "Custom"}
        </button>
      )}
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
