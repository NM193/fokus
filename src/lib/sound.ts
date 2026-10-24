import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./desktop";
import type { SoundName } from "./settings";

/**
 * A soft two-note chime, synthesised so there is no audio file to ship.
 *
 * Browsers only let audio start after a gesture, so `prime` is called from the
 * Start button and the context is reused for the chime at the end of a phase.
 *
 * In the Mac app the app itself plays it, or one of the Mac's own sounds
 * (src-tauri/src/chime.rs): the window is usually hidden when a phase ends,
 * and a hidden web view's audio is not to be relied on.
 */

let context: AudioContext | null = null;

export function prime() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    context = null;
  }
}

function note(ctx: AudioContext, frequency: number, at: number, peak: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 1.5);
}

/** `volume` is 0 to 1; a browser plays the chime whatever `sound` is. */
export function chime(sound: SoundName, volume: number) {
  if (isDesktop) {
    void invoke("ring", { sound, volume });
    return;
  }
  prime();
  if (!context) return;
  // Full volume is as loud as the Mac app's (CHIME_GAIN in chime.rs).
  const peak = 0.43 * Math.min(1, Math.max(0, volume));
  const t = context.currentTime + 0.05;
  note(context, 659.25, t, peak); // E5
  note(context, 987.77, t + 0.22, peak); // B5
}
