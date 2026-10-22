//! The mini timer: a small glass window that floats over everything.
//!
//! It loads the same frontend as the main window; src/main.tsx sees the
//! window's label and renders only the widget. It holds no timer of its own --
//! the main window sends it state and takes its commands as events.

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::glass;

pub const LABEL: &str = "widget";
const WIDTH: f64 = 340.0;
const HEIGHT: f64 = 132.0;
/// From the screen's right edge, and down from the top past the menu bar.
const MARGIN: f64 = 24.0;
const TOP: f64 = 44.0;

pub fn toggle(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
        return;
    }
    if open(app).is_ok() {
        let _ = app.emit("fokus://widget", true);
    }
}

pub fn is_open(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).is_some()
}

fn open(app: &AppHandle) -> tauri::Result<()> {
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Fokus")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .theme(Some(tauri::Theme::Light));

    // Top right of the main screen, where a glance goes anyway.
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
        builder = builder.position(size.width - WIDTH - MARGIN, TOP);
    }

    let window = builder.build()?;
    glass::widget(&window);
    Ok(())
}
