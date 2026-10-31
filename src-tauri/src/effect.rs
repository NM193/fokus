//! What you see with the sound when a phase ends (Settings → Behaviour →
//! Effect): a ripple out of the mini timer, or a glow round the screen's
//! edges.
//!
//! A page (EffectWindow) draws it in a clear window over a whole screen that
//! the pointer passes through. Like the card it is made hidden ahead of time
//! (alert.rs says why) and only shown and hidden after. It sits one level
//! below the other floating windows, so a ripple comes from behind the one it
//! leaves and a glow never tints them.

use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::float;

pub const LABEL: &str = "effect";
/// Long enough for either to finish (.effect in styles.css).
const LASTS: Duration = Duration::from_millis(3200);

/// What the page draws: sent as `fokus://effect`.
#[derive(Clone, Serialize)]
struct Shown {
    kind: String,
    palette: String,
    /// What a ripple leaves from, in the page's px; none: the card's place.
    from: Option<Rect>,
    /// Counts showings: a new one restarts the drawing, and a hide that
    /// finishes late leaves a newer one be.
    run: u64,
}

#[derive(Clone, Copy, Serialize)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Default)]
pub struct State(Mutex<u64>);

/// Makes the effect's window, hidden, unless it is made already.
pub fn prepare(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Fokus")
        .inner_size(400.0, 300.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .theme(Some(tauri::Theme::Light));
    let window = float::same_browser(app, builder).build()?;
    float::to_panel(&window, false)?;

    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::{ManagerExt, PanelLevel};
        if let Ok(panel) = app.get_webview_panel(LABEL) {
            panel.set_ignores_mouse_events(true);
            panel.set_level(PanelLevel::Floating.value() - 1);
        }
    }
    Ok(())
}

/// Shows `kind` ("ripple" or "glow") in `palette`, then puts it away.
pub fn show(app: &AppHandle, kind: String, palette: String) {
    if prepare(app).is_err() {
        return;
    }
    let from = place(app, &kind);
    let run = {
        let state = app.state::<State>();
        let mut runs = state.0.lock().unwrap();
        *runs += 1;
        *runs
    };
    let _ = app.emit_to(LABEL, "fokus://effect", Shown { kind, palette, from, run });
    reveal(app);

    let handle = app.clone();
    thread::spawn(move || {
        thread::sleep(LASTS);
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if *app.state::<State>().0.lock().unwrap() == run {
                conceal(&app);
            }
        });
    });
}

/// Moves the window over the right screen and says where, on it, a ripple
/// leaves from: the mini timer while it is open, else the card's place. A
/// glow goes on the screen the pointer is on.
#[cfg(target_os = "macos")]
fn place(app: &AppHandle, kind: &str) -> Option<Rect> {
    use tauri_nspanel::objc2::MainThreadMarker;
    use tauri_nspanel::objc2_app_kit::{NSEvent, NSScreen};
    use tauri_nspanel::{ManagerExt, NSPoint, NSRect};

    let mtm = MainThreadMarker::new()?;
    let overlay = app.get_webview_panel(LABEL).ok()?;
    let source: Option<NSRect> = if kind == "ripple" {
        let widget = app
            .get_webview_panel(crate::widget::LABEL)
            .ok()
            .filter(|panel| panel.is_visible());
        widget
            .or_else(|| app.get_webview_panel(crate::alert::LABEL).ok())
            .map(|panel| panel.as_panel().frame())
    } else {
        None
    };
    let at = match source {
        Some(f) => NSPoint::new(f.origin.x + f.size.width / 2.0, f.origin.y + f.size.height / 2.0),
        None => NSEvent::mouseLocation(),
    };
    let inside = |r: NSRect| {
        at.x >= r.origin.x
            && at.x < r.origin.x + r.size.width
            && at.y >= r.origin.y
            && at.y < r.origin.y + r.size.height
    };
    let screen = NSScreen::screens(mtm)
        .iter()
        .find(|screen| inside(screen.frame()))
        .or_else(|| NSScreen::mainScreen(mtm))?;
    let frame = screen.frame();
    overlay.as_panel().setFrame_display(frame, false);
    // AppKit's y goes up from the screen's bottom; the page's goes down.
    source.map(|f| Rect {
        x: f.origin.x - frame.origin.x,
        y: frame.origin.y + frame.size.height - (f.origin.y + f.size.height),
        width: f.size.width,
        height: f.size.height,
    })
}

#[cfg(not(target_os = "macos"))]
fn place(_: &AppHandle, _: &str) -> Option<Rect> {
    None
}

fn reveal(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel(LABEL) {
            panel.set_alpha_value(1.0);
            panel.order_front_regardless();
        }
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.show();
    }
}

fn conceal(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel(LABEL) {
            panel.hide();
        }
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}
