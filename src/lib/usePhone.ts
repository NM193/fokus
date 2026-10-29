import { useEffect, useRef } from "react";
import {
  cancel,
  isPermissionGranted,
  requestPermission,
  Schedule,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isPhone } from "./desktop";
import { phaseEnded } from "./notify";
import type { Settings } from "./settings";
import { phaseLength, type Timer } from "./useTimer";

/**
 * The phone app's one addition to what a browser does: the end of a running
 * phase is booked with the phone as a notification, the moment the phase
 * starts. A phone stops the web view soon after it is locked or left, so the
 * timer cannot ring then; the phone can, at `endsAt`, whatever the app is
 * doing. With the app open the phone shows it too (iOS and Android both
 * present it in front), so Fokus does not chime as well (`phoneRings`).
 */

/** One notification at a time: the end of the running phase. */
const ID = 1;
/** Fokus's chime once it is bundled with the app; till then, the phone's own sound. */
const SOUND = "chime.wav";

/** Whether the phone lets Fokus notify, as of the last time it was asked. */
let granted = false;
let asked = false;

/** Asks once per launch, the first time a phase starts; a yes stands till the app quits. */
async function allowed(): Promise<boolean> {
  if (granted || (await isPermissionGranted())) return (granted = true);
  if (asked) return false;
  asked = true;
  return (granted = (await requestPermission()) === "granted");
}

/** The phone will say a phase is over, sound and all, so the app need not chime. */
export const phoneRings = (settings: Settings) => isPhone && settings.notify && granted;

/** Bookings run one after another, so a quick pause and start cannot cross. */
let queue = Promise.resolve();

export function usePhone(timer: Timer, current: string | undefined, settings: Settings) {
  const { endsAt, phase, upNext } = timer;
  const minutes = phaseLength(upNext, settings) / 60_000;
  const task = upNext === "focus" ? current : undefined;
  /** When the booked notification goes off; null when none is booked. */
  const booked = useRef<number | null>(null);

  useEffect(() => {
    if (!isPhone) return;
    const was = booked.current;
    const at = settings.notify ? endsAt : null;
    booked.current = at;
    const { title, body } = phaseEnded(phase, upNext, minutes, settings.autoStart, task);
    const sound = settings.sound ? SOUND : undefined;

    queue = queue.then(async () => {
      try {
        // One that is going off about now is left alone: the phase ran out,
        // and taking it back could beat it to the punch.
        if (was !== null && was > Date.now() + 1000) await cancel([ID]);
        if (at === null || at <= Date.now() || !(await allowed())) return;
        sendNotification({ id: ID, title, body, sound, schedule: Schedule.at(new Date(at), false, true) });
      } catch {
        // A courtesy, like the Mac's: never in the way of the timer.
      }
    });
  }, [endsAt, phase, upNext, minutes, task, settings.notify, settings.sound, settings.autoStart]);
}
