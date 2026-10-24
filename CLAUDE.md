# Fokus

## What this is
A personal focus timer, Pomodoro-like, for one person. A timer with
adjustable focus and break lengths, a task list for the session that you tick
off, and a completion percentage for the session. Ended sessions go to
History.

A **macOS desktop app** (Tauri v2, built like Tzz in `../yt-mp3`). The same
frontend still runs in a plain browser tab; everything desktop-only checks
`isDesktop` (`src/lib/desktop.ts`). The repo is public
(github.com/NM193/fokus): the app updates itself from its GitHub Releases.

## Tech stack
- React 18 + TypeScript + Vite; Tauri v2 (Rust) for the Mac app.
- State lives in `localStorage` (`src/lib/store.ts`), one versioned key per
  concern: `fokus.settings.v1`, `fokus.timer.v1`, `fokus.session.v1`,
  `fokus.history.v1`, `fokus.guide.v1` (the first-launch guide was seen). A
  shape change bumps the key rather than migrating.
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
  `WidgetWindow`, `AlertWindow` (the end-of-phase card), `EffectWindow`,
  `Guide` (the first-launch tour, a `<dialog>`; Settings → Help shows it
  again), `Round` (one round to scale, in Settings and the guide).
- `src-tauri/src/` `clock` (menu bar clock and the end-of-phase alarm),
  `tray` (menu bar icon and menu), `widget` (the mini timer's window), `alert`
  (the end-of-phase card), `effect` (what you see with the sound), `float`
  (what those share: the panel, the rounded rim, glide and fade), `glass`
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
- **The sound is played by the app** (`ring` → `afplay`), not the web view:
  Fokus's chime or one of the Mac's, at a volume (Settings → Behaviour).
  Only names on the list in chime.rs are played; it mirrors `SOUNDS` in
  settings.ts.
- **A card at the end of a phase** (`alert.rs`, `AlertWindow`): a floating
  panel at the top middle of the screen, sent from `useTimer`'s `onEnd` like
  the notification and, like it, only while the window is not in front. It
  stays until answered, or until the next phase is started anywhere. It is
  made hidden at launch (`prepare_alert`) and only shown and hidden after:
  making a web view activates the app (wry), which at the end of a phase
  would take the keyboard from whatever you are typing in. Its button sends
  `start`, which starts only what is not running.
- **An effect with the sound** (`effect.rs`, `EffectWindow`, Settings →
  Behaviour → Effect): a ripple out of the mini timer (the card's place when
  it is closed) or a glow round the edges of the screen the pointer is on.
  Every phase end, window in front or not; picking one in Settings shows it.
  A clear, click-through panel over a whole screen, one level below the other
  floating windows, made hidden at launch like the card.
- **A notification at the end of a phase** (`src/lib/notify.ts`,
  tauri-plugin-notification), sent from `useTimer`'s `onEnd` beside the
  chime, only while the window is not focused. macOS asks once, the first
  time. A dev build sends them as Terminal, which macOS drops: try them in
  the built app.
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
  It is turned into a non-activating NSPanel (tauri-nspanel): the only kind
  of window macOS floats over another app's full screen.
- **Settings → Mini timer:** size, opacity (Mac only) and which parts it
  shows. What it shows and its scale travel with the state (`look`);
  everything in the widget is in rem, so one root font size scales it. The
  window's size (`widgetBox`, which mirrors the CSS) and opacity go to Rust
  via `set_widget_look`.
- **Only the time** (Settings → Mini timer): the widget shrinks to the time
  (`widgetIdleBox`) and grows back while the pointer is over it. The web view
  cannot tell (macOS sends hover only to the window in front), so Rust polls
  the pointer (`widget::watch`) and sends `fokus://widget-place` (over, and
  the corner nearest the screen's edges it grows from).
- **Nothing jumps.** Every change of the widget's window (grow, shrink, fade
  in on open, fade out on close, opacity) is one AppKit glide, `GLIDE`/`EASE`
  in widget.rs, the same as `--glide`/`--ease` in the CSS: change both. The
  web view never changes size on the way (a resized one redraws late and its
  content shakes): it stays the full size, pinned by autoresizing margins to
  that corner (`pin_page`), and the window only uncovers it. So the corners
  and the rim are the window's content view's layer, not CSS. The rest fades
  in and the time glides into place. The window opens hidden and is shown on
  `fokus://widget-ready`.
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
  draw from the left. A task row that has been moved or renamed is marked
  `data-still` and stops animating: React moving a DOM node replays its CSS
  animations, so a dropped row would arrive all over again.
- The timer and the tasks are the app. Statistics stay secondary, on their own
  screen.

## Rules
- Completion is counted by tasks (done / total), never by time.
- Transitions in `useTimer` run side effects once, outside state updaters --
  StrictMode calls updaters twice.
- Do not edit Rust while trying the app with a timer running: `tauri dev`
  restarts the app on every Rust change.
- No AppKit animator glide may still be running on a floating panel when it
  is turned back into Tauri's window (`to_window`, before a close): AppKit's
  KVO watch on it throws and the app crashes. So `float::close` fades by hand.

## Commands
- `npx tauri dev` -- the Mac app in dev (Vite on http://localhost:1424; 1420 is Tzz's)
- `npm run dev` -- the frontend alone, in a browser
- `npm run build` -- typecheck and build the frontend
- `npx tauri build --bundles app` -- `src-tauri/target/release/bundle/macos/Fokus.app`;
  installed by copying it over `/Applications/Fokus.app` (quit the running one first)
- `cd src-tauri && cargo test` -- the menu bar clock's text
- `bash scripts/release.sh 0.3.0 "What changed."` -- universal build, `.dmg`,
  GitHub Release and the `latest.json` installed copies check at launch
  (`UpdateNotice`). Signed with `~/.tauri/fokus.key` (Tauri's update key, not
  Apple's: the app is not notarised, so the first open needs System Settings ->
  Privacy & Security -> Open Anyway; right-click -> Open before macOS 15).
  The release page also gives a Terminal line (`curl … | tar -xz -C
  /Applications`) that installs with no quarantine, so nothing is asked
