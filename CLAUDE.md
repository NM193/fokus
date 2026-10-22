# Fokus

## What this is
A personal focus timer, Pomodoro-like, for one person. A timer with
adjustable focus and break lengths, a task list for the session that you tick
off, and a completion percentage for the session. Ended sessions go to
History.

A **macOS desktop app** (Tauri v2, built like Tzz in `../yt-mp3`). The same
frontend still runs in a plain browser tab; everything desktop-only checks
`isDesktop` (`src/lib/desktop.ts`). Git is deliberately not set up yet.

## Tech stack
- React 18 + TypeScript + Vite; Tauri v2 (Rust) for the Mac app.
- State lives in `localStorage` (`src/lib/store.ts`), one versioned key per
  concern: `fokus.settings.v1`, `fokus.timer.v1`, `fokus.session.v1`,
  `fokus.history.v1`. A shape change bumps the key rather than migrating.
  The dev app (http://localhost:1424) and the built app (tauri://) are
  different origins, so they do not share data.

## Structure
- `src/lib/useTimer.ts` the timer. A running phase stores the moment it ends
  (`endsAt`); the display is derived from the clock, so a throttled window or
  a reload never loses time. Focus time is handed to the session on pause,
  skip, reset and finish via `markAt`, never per tick.
- `src/lib/useSession.ts` tasks, focus time and rounds of the current session;
  `end()` writes a record to History and carries unfinished tasks over.
- `src/lib/settings.ts` lengths, palette, window surface, auto-start, chime.
- `src/components/` `Sidebar` (nav pill taken from Tzz), `Dial` (ring and
  controls), `TaskList`, `HistoryView`, `SettingsView`, `Widget`,
  `WidgetWindow`.
- `src-tauri/src/` `clock` (menu bar clock and the end-of-phase alarm),
  `tray` (menu bar icon and menu), `widget` (the mini timer's window), `glass`
  (vibrancy), `chime` (the sound), `login` (open at login), `shortcut` (the
  global key), `commands` (thin).
- `scripts/make-assets.py` draws the app icon, the menu bar icon and the
  chime. It is their only source; `npx tauri icon src-tauri/icons/app-icon.png`
  makes the icon sizes.

## The Mac app
The timer's logic stays in the main window's frontend. The app around it:

- **Closing the window hides it.** The timer keeps running; the Dock icon or
  the menu bar brings it back; Quit is in the menu bar menu (or Cmd-Q).
- **Menu bar clock.** The window sends its timer on every change
  (`sync_timer`, `src/lib/useDesktop.ts` ↔ `clock.rs`, one shape, change
  both). A Rust thread draws the time beside the icon and sends `fokus://due`
  when a phase is over -- a hidden web view's timers are slowed right down,
  but it still answers events, and it finishes the phase then.
- **The chime is played by the app** (`ring` → `afplay`), not the web view.
- **Commands from the menu bar and the mini timer** arrive as
  `fokus://command` ("toggle" / "skip") and run through the same `timer`
  functions as the buttons.
- **Glass.** Both windows are always transparent and forced to the light
  appearance; Settings → Window picks glass (macOS vibrancy behind a pastel
  tint) or solid paper.
- **Open at login** (on by default, Settings → Mac): a LaunchAgent
  (`~/Library/LaunchAgents/Fokus.plist`) starts the app with `--hidden`, so it
  comes up as the menu bar clock with no window. The main window is
  `visible: false` in tauri.conf.json and shown from setup otherwise. Dev
  builds never register: they would point login at target/debug.
- **⌃⌥F starts and pauses from any app** (`shortcut.rs`). Registered after
  the plugin, so a shortcut already taken elsewhere means no shortcut rather
  than an app that will not start.

## Mini timer (widget)
A small always-on-top window with the time, phase, current task, start/pause
and skip. `Widget` only draws; the caller supplies the state.

- **Mac app:** a window of its own (`widget.rs`, label `widget`) that loads
  the same page; `src/main.tsx` renders `WidgetWindow` there. It owns no
  timer: the main window emits `fokus://state` snapshots, the widget counts
  down from `endsAt` itself and sends commands back. It asks for the first
  snapshot (`fokus://widget-ready`) only once its listener is registered.
- **Browser:** Chrome's Document Picture-in-Picture, with `Widget` portalled
  into it. Styles are carried over by cloning `<style>`/`<link>` elements,
  never via `cssRules`: Chrome serialises a `font` shorthand holding a var()
  as empty longhands.
- Either way the widget ticks from its own window: the main window is usually
  hidden then.

## Design
Tzz's editorial direction (`../yt-mp3/docs/design-reference-work.md`) in a
pastel key. The rules that carry it:

- **Every colour lives at the top of `src/styles.css`.** Three palettes
  (lavender, sage, rose), each four colours from the brief plus an ink; the
  rest is mixed from those with `color-mix`. Nothing below that block names a
  colour.
- **Two faces, hard split.** Serif (Instrument Serif, bundled) for headings
  and big numbers; sans for anything clickable; mono uppercase and dim for
  anything you only read.
- **One gesture.** Things arrive from below; rules (including the task strike)
  draw from the left.
- The timer and the tasks are the app. Statistics stay secondary, on their own
  screen.

## Rules
- Completion is counted by tasks (done / total), never by time.
- Transitions in `useTimer` run side effects once, outside state updaters --
  StrictMode calls updaters twice.
- Do not edit Rust while trying the app with a timer running: `tauri dev`
  restarts the app on every Rust change.

## Commands
- `npx tauri dev` -- the Mac app in dev (Vite on http://localhost:1424; 1420 is Tzz's)
- `npm run dev` -- the frontend alone, in a browser
- `npm run build` -- typecheck and build the frontend
- `npx tauri build --bundles app` -- `src-tauri/target/release/bundle/macos/Fokus.app`;
  installed by copying it over `/Applications/Fokus.app` (quit the running one first)
- `cd src-tauri && cargo test` -- the menu bar clock's text
