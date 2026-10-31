import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop, isWindows } from "./desktop";
import type { Effect, Palette } from "./settings";
import { PHASE_NAME, type Phase } from "./useTimer";

/**
 * Saying on screen that a phase is over, beside the chime.
 *
 * Only in the Mac app, and only while its window is not in front: a phase
 * usually ends with the window hidden, and in front the dial already says so.
 * Nothing to ask for here: on desktop the plugin always says yes, and macOS
 * asks by itself, once, the first time Fokus sends one (later it is Fokus's
 * switch in System Settings → Notifications). A dev build sends them as
 * Terminal, which macOS drops unless Terminal may notify.
 */
export async function tell(title: string, body: string) {
  if (!isDesktop) return;
  try {
    if (await getCurrentWindow().isFocused()) return;
    sendNotification({ title, body });
  } catch {
    // A courtesy; never let it get in the way of the phase that just ended.
  }
}

/**
 * What the end-of-phase card says (src-tauri/src/alert.rs, AlertWindow).
 * `task` only when focus is next.
 */
export type Notice = { ended: Phase; next: Phase; minutes: number; started: boolean; task: string | null };

/**
 * The card over everything when a phase ends: the chime alone is easy to
 * miss. Only in the Mac app, and, like the notification, only while its
 * window is not in front.
 */
export async function card(notice: Notice) {
  if (!isDesktop) return;
  try {
    if (await getCurrentWindow().isFocused()) return;
    await invoke("show_alert", { notice });
  } catch {
    // As above: never in the way of the phase that just ended.
  }
}

/**
 * What you see with the sound (src-tauri/src/effect.rs): at the end of every
 * phase, the window in front or not, and when Settings tries one. Not on
 * Windows yet, where Settings does not offer it.
 */
export function flash(effect: Effect, palette: Palette) {
  if (!isDesktop || isWindows || effect === "none") return;
  void invoke("show_effect", { kind: effect, palette }).catch(() => {});
}

/** "Short break, 5 min, has started." -- what the notification says. */
export function phaseEnded(ended: Phase, next: Phase, minutes: number, started: boolean, task?: string) {
  const title = ended === "focus" ? "Focus block done" : "Break is over";
  let body = `${PHASE_NAME[next]}, ${minutes} min, ${started ? "has started" : "is ready to start"}.`;
  if (next === "focus" && task) body += ` Next task: ${task}`;
  return { title, body };
}
