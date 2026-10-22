type Props = {
  /** 0 to 1. */
  progress: number;
  className: string;
  /** Stroke width in viewBox units; the ring is drawn on a 240-unit square. */
  stroke?: number;
};

const R = 108;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** The ring that fills as a phase passes. Used by the dial and the widget. */
export function Ring({ progress, className, stroke = 7 }: Props) {
  return (
    <svg className={`ring ${className}`} viewBox="0 0 240 240" aria-hidden="true">
      <circle className="ring__track" cx="120" cy="120" r={R} strokeWidth={stroke} />
      <circle
        className="ring__arc"
        cx="120"
        cy="120"
        r={R}
        strokeWidth={stroke}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
        // A round cap on an empty arc still paints a dot at the top.
        opacity={progress > 0 ? 1 : 0}
      />
    </svg>
  );
}
