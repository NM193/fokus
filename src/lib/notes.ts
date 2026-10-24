/**
 * What the session says once every task in it is ticked off, unless lines of
 * your own are set in Settings. Any language will do: the serif has Serbian
 * letters.
 */
export const NOTES = [
  "Everything you set out to do is done.",
  "All of it, done. Go and rest.",
  "Every task ticked off. That was a good session.",
  "Done, and done well. Time for a pause.",
  "Nothing left on the list. Enjoy the quiet.",
  "That was the whole list. Be proud of it.",
];

/**
 * One note per session and list: it stays the same while you look at it and
 * across a reload, and a task added and ticked off brings another. `own` is
 * the Settings field, one note per line.
 */
export function noteFor(startedAt: number, total: number, own: string): string {
  const lines = own.split("\n").map((line) => line.trim()).filter(Boolean);
  const notes = lines.length ? lines : NOTES;
  return notes[(Math.floor(startedAt / 1000) + total) % notes.length];
}
