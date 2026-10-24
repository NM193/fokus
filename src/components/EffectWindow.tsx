import { useEffect, useState } from "react";
import { EVENTS, on } from "../lib/desktop";
import type { Palette } from "../lib/settings";

type Box = { x: number; y: number; width: number; height: number };

/** What the app sends: `Shown` in src-tauri/src/effect.rs. */
type Shown = {
  kind: "ripple" | "glow";
  palette: Palette;
  /** What a ripple leaves from; none: the card's place. */
  from: Box | null;
  run: number;
};

/** Where the card sits (src-tauri/src/alert.rs), for a ripple with nothing else to leave from. */
const CARD = { width: 320, height: 136, top: 44 };

/**
 * The effect that comes with the sound, in a clear window over a whole screen
 * that the pointer passes through (src-tauri/src/effect.rs). It draws each
 * showing afresh: `run` keys it, so a new one restarts it.
 */
export function EffectWindow() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    document.documentElement.dataset.window = "effect";
    return on<Shown>(EVENTS.effect, setShown);
  }, []);

  const palette = shown?.palette;
  useEffect(() => {
    if (palette) document.documentElement.dataset.palette = palette;
  }, [palette]);

  if (!shown) return null;
  if (shown.kind === "glow") return <div key={shown.run} className="effect-glow" />;

  const from = shown.from ?? {
    x: (window.innerWidth - CARD.width) / 2,
    y: CARD.top,
    width: CARD.width,
    height: CARD.height,
  };
  const box = { left: from.x, top: from.y, width: from.width, height: from.height };
  return (
    <div key={shown.run}>
      <i className="effect-halo" style={box} />
      {[0, 1, 2].map((i) => (
        <i key={i} className="effect-ring" style={{ ...box, animationDelay: `${i * 0.38}s` }} />
      ))}
    </div>
  );
}
