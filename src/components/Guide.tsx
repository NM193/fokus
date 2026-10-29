import { useEffect, useRef, useState, type ReactNode } from "react";
import { isDesktop, isPhone } from "../lib/desktop";
import { clock } from "../lib/format";
import { flash } from "../lib/notify";
import type { Settings } from "../lib/settings";
import { chime } from "../lib/sound";
import { load, save } from "../lib/store";
import { Ring } from "./Ring";
import { Round } from "./Round";

const KEY = "fokus.guide.v1";

/** Whether the guide has been through, or skipped, here. */
export const guideSeen = () => load<{ seen?: boolean }>(KEY, {}).seen === true;
export const markGuideSeen = () => save(KEY, { seen: true });

/** How long the guide takes to go (.guide[data-leaving] in styles.css). */
const LEAVE_MS = 220;

type Step = { eyebrow: string; title: ReactNode; body: ReactNode; show?: ReactNode };

type Props = { settings: Settings; onClose: () => void };

/**
 * The few things worth knowing, one at a time, the first time Fokus opens;
 * Settings → Help shows it again. Every step is the same size, so moving on
 * only fades the next one in.
 */
export function Guide({ settings, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // showModal focuses the first button, Skip; Enter should go on instead.
    next.current?.focus();
  }, []);

  function close() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, LEAVE_MS);
  }

  function tryIt() {
    if (settings.sound) chime(settings.soundName, settings.soundVolume);
    flash(settings.effect, settings.palette);
  }

  const steps = guideSteps(settings, tryIt);
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <dialog
      ref={dialog}
      className="guide"
      aria-labelledby="guide-title"
      data-leaving={leaving ? "" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="guide__step" key={index}>
        <span className="eyebrow">{step.eyebrow}</span>
        <h2 id="guide-title" className="guide__title">
          {step.title}
        </h2>
        <div className="guide__body">{step.body}</div>
        {step.show && <div className="guide__show">{step.show}</div>}
      </div>

      <div className="guide__foot">
        <ol className="guide__dots" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <li key={s.eyebrow} data-now={i === index ? "" : undefined} data-done={i < index ? "" : undefined} />
          ))}
        </ol>
        {!last && (
          <button type="button" className="guide__skip" onClick={close}>
            Skip
          </button>
        )}
        {index > 0 && (
          <button type="button" className="ghost ghost--small" onClick={() => setIndex(index - 1)}>
            Back
          </button>
        )}
        <button ref={next} type="button" className="cta cta--small" onClick={() => (last ? close() : setIndex(index + 1))}>
          {last ? "Start focusing" : "Next"}
        </button>
      </div>
    </dialog>
  );
}

function guideSteps(settings: Settings, tryIt: () => void): Step[] {
  const steps: Step[] = [
    {
      eyebrow: "Welcome",
      title: (
        <>
          One thing <em>at a time.</em>
        </>
      ),
      body: (
        <p>
          Fokus is a quiet timer for focused work: a block of focus, a break, and a short list of what you mean to get
          done.
        </p>
      ),
      show: (
        <div className="guide__dial">
          <Ring className="guide__ring" progress={0.62} />
          <span>{clock(settings.focus * 60_000)}</span>
        </div>
      ),
    },
    {
      eyebrow: "The session",
      title: (
        <>
          Tasks, <em>ticked off.</em>
        </>
      ),
      body: (
        <p>
          Start a block with the button under the timer, or Space. Add the session's tasks beside it and tick them off
          as you go: a session counts what you finish, not the minutes. End it, and it goes to History.
        </p>
      ),
      show: (
        <ul className="guide__tasks" aria-label="A session's tasks">
          <li data-done="">Outline the chapter</li>
          <li data-done="">Write the intro</li>
          <li>Read it through once</li>
        </ul>
      ),
    },
    {
      eyebrow: "Breaks",
      title: (
        <>
          A round <em>of blocks.</em>
        </>
      ),
      body: (
        <p>
          After each block comes a short break. After the last block of a round comes a long one, and a new round
          begins. Change the lengths in Settings, or right under the timer.
        </p>
      ),
      show: <Round settings={settings} />,
    },
  ];

  if (isDesktop) {
    steps.push({
      eyebrow: "On your Mac",
      title: (
        <>
          Always <em>in reach.</em>
        </>
      ),
      body: (
        <ul className="guide__list">
          <li>The time sits in the menu bar. Closing the window only hides it: the timer keeps going.</li>
          <li>The mini timer floats over every app, full-screen ones too. Open it from the sidebar or the menu bar.</li>
          <li>
            <kbd className="keys">⌃⌥F</kbd> starts and pauses from any app.
          </li>
        </ul>
      ),
    });
  }

  steps.push({
    eyebrow: "When a phase ends",
    title: (
      <>
        You will <em>know.</em>
      </>
    ),
    body: (
      <p>
        {isDesktop
          ? "A sound, a soft glow and a card that waits until you answer it. Choose the sound, the effect and the card in Settings."
          : isPhone
            ? "A note and a soft chime, even with the phone locked. Turn either off in Settings."
            : "A soft chime. Turn it off, or set how loud it is, in Settings."}
      </p>
    ),
    show: (
      <button type="button" className="ghost ghost--small" onClick={tryIt}>
        Try it
      </button>
    ),
  });

  return steps;
}
