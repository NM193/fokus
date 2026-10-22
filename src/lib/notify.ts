import { sendNotification } from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "./desktop";
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

/** "Short break, 5 min, has started." -- what the notification says. */
export function phaseEnded(ended: Phase, next: Phase, minutes: number, started: boolean, task?: string) {
  const title = ended === "focus" ? "Focus block done" : "Break is over";
  let body = `${PHASE_NAME[next]}, ${minutes} min, ${started ? "has started" : "is ready to start"}.`;
  if (next === "focus" && task) body += ` Next task: ${task}`;
  return { title, body };
}
