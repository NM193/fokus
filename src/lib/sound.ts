import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./desktop";

/**
 * A soft two-note chime, synthesised so there is no audio file to ship.
 *
 * Browsers only let audio start after a gesture, so `prime` is called from the
 * Start button and the context is reused for the chime at the end of a phase.
 *
 * In the Mac app the app itself plays it (src-tauri/src/chime.rs): the window
 * is usually hidden when a phase ends, and a hidden web view's audio is not to
 * be relied on.
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

function note(ctx: AudioContext, frequency: number, at: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 1.5);
}

export function chime() {
  if (isDesktop) {
    void invoke("ring");
    return;
  }
  prime();
  if (!context) return;
  const t = context.currentTime + 0.05;
  note(context, 659.25, t); // E5
  note(context, 987.77, t + 0.22); // B5
}
