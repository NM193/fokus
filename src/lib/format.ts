/**
 * Minutes and seconds left. Rounds up, so a fresh 25-minute block reads 25:00
 * rather than 24:59, and 0:00 only shows once the time is really gone.
 */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "50 min", "1 h 25 min". Focus time is never shown in seconds. */
export function duration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

export const dayLabel = (at: number) => DAY.format(at);
export const timeLabel = (at: number) => TIME.format(at);
export const weekdayLabel = (at: number) => WEEKDAY.format(at);

/** Midnight at the start of the day `at` falls on. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
