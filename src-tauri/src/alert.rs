//! The card that says a phase is over: a small glass panel at the top of the
//! screen, over everything (float.rs), until it is answered. The chime is easy
//! to miss; this is not.
//!
//! It is made once, hidden, when the main window asks (`prepare`), and only
//! shown and hidden after that. Making a web view activates the app (wry), so
//! a card made at the end of a phase would take the keyboard from whatever
//! you are typing in.
//!
//! The main window sends what it says (`Notice`); its page (AlertWindow) draws
//! it, and its buttons, or the next phase starting anywhere, put it away.

use std::sync::Mutex;
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::float::{self, GLIDE};
use crate::glass;

pub const LABEL: &str = "alert";
/// Mirrors .alert in styles.css.
const WIDTH: f64 = 320.0;
const HEIGHT: f64 = 136.0;
/// Down from the top of the screen, past the menu bar.
const TOP: f64 = 44.0;

/// What the card says. Made by the main window (src/lib/notify.ts).
#[derive(Clone, Serialize, Deserialize)]
pub struct Notice {
    pub ended: String,
    pub next: String,
    pub minutes: f64,
    /// The next phase started by itself.
    pub started: bool,
    pub task: Option<String>,
}

#[derive(Default)]
pub struct State(Mutex<Inner>);

#[derive(Default)]
struct Inner {
    notice: Option<Notice>,
    /// Counts showings, so a hide that finishes late leaves a newer card be.
    shown: u64,
    visible: bool,
}

/// Makes the card, hidden, unless it is made already.
pub fn prepare(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Fokus")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .decorations(false)
        // As the mini timer's (widget.rs): no glass on Windows.
        .transparent(cfg!(not(windows)))
        .shadow(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        // Its buttons answer the first click, from whatever app is in front.
        .accept_first_mouse(true)
        .visible(false)
        .theme(Some(tauri::Theme::Light));

    // The top of the main screen, in the middle: where it cannot be missed.
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
        builder = builder.position((size.width - WIDTH) / 2.0, TOP);
    }

    let window = builder.build()?;
    glass::float(&window);
    #[cfg(windows)]
    crate::frame::round(&window);
    float::to_panel(&window, true)
}

/// Says `notice`, over whatever is in front.
pub fn show(app: &AppHandle, notice: Notice) {
    if prepare(app).is_err() {
        return;
    }
    {
        let state = app.state::<State>();
        let mut inner = state.0.lock().unwrap();
        inner.notice = Some(notice.clone());
        inner.shown += 1;
        inner.visible = true;
    }
    let _ = app.emit_to(LABEL, "fokus://alert", notice);
    float::reveal(app, LABEL, 1.0);
}

/// What the card says now: its page asks when it loads.
pub fn notice(app: &AppHandle) -> Option<Notice> {
    app.state::<State>().0.lock().unwrap().notice.clone()
}

/// Fades the card out and puts it away, ready for the next time.
pub fn hide(app: &AppHandle) {
    let shown = {
        let state = app.state::<State>();
        let mut inner = state.0.lock().unwrap();
        if !inner.visible {
            return;
        }
        inner.visible = false;
        inner.notice = None;
        inner.shown
    };
    float::fade(app, LABEL, 0.0);
    let handle = app.clone();
    thread::spawn(move || {
        thread::sleep(GLIDE);
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            let state = app.state::<State>();
            let inner = state.0.lock().unwrap();
            if inner.visible || inner.shown != shown {
                return;
            }
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
        });
    });
}
