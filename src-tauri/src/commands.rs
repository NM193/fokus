//! What the frontend can ask of the app. Thin: the work is in the modules.

use tauri::{AppHandle, State};

use crate::clock::{Clock, TimerState};
use crate::{alert, chime, effect, float, glass, login, tray, widget};

/// The window's timer changed: start, pause, a new phase, a reset.
#[tauri::command]
pub fn sync_timer(app: AppHandle, clock: State<'_, Clock>, state: TimerState) {
    let running = state.running();
    let before = clock.replace(state);
    if before.running() != running {
        tray::refresh(&app, running);
    }
}

/// A newer version the window found, for the menu bar menu to offer; none when there is not one.
#[tauri::command]
pub fn set_update(app: AppHandle, version: Option<String>) {
    tray::set_update(&app, version);
}

#[tauri::command]
pub fn ring(sound: String, volume: f64) {
    chime::play(&sound, volume);
}

/// Makes the end-of-phase card ahead of time, hidden (alert.rs says why).
/// This and the others that may make a window do it outside the command
/// (float.rs says why).
#[tauri::command]
pub fn prepare_alert(app: AppHandle) {
    float::outside_command(&app, |app| {
        let _ = alert::prepare(app);
    });
}

#[tauri::command]
pub fn show_alert(app: AppHandle, notice: alert::Notice) {
    float::outside_command(&app, move |app| alert::show(app, notice));
}

#[tauri::command]
pub fn alert_notice(app: AppHandle) -> Option<alert::Notice> {
    alert::notice(&app)
}

#[tauri::command]
pub fn hide_alert(app: AppHandle) {
    alert::hide(&app);
}

/// Makes the end-of-phase effect's window ahead of time, hidden.
#[tauri::command]
pub fn prepare_effect(app: AppHandle) {
    float::outside_command(&app, |app| {
        let _ = effect::prepare(app);
    });
}

/// "ripple" or "glow", now: at the end of a phase, and when Settings tries one.
#[tauri::command]
pub fn show_effect(app: AppHandle, kind: String, palette: String) {
    float::outside_command(&app, move |app| effect::show(app, kind, palette));
}

#[tauri::command]
pub fn set_glass(app: AppHandle, glass: bool) {
    glass::main(&app, glass);
}

/// Windows: the title bar in the palette's colours (frame.rs). Nothing to do
/// elsewhere: the Mac's has none to paint.
#[tauri::command]
pub fn set_frame(app: AppHandle, caption: String, text: String, border: String) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            crate::frame::paint(&window, &caption, &text, &border);
        }
    }
    #[cfg(not(windows))]
    let _ = (app, caption, text, border);
}

#[tauri::command]
pub fn set_open_at_login(app: AppHandle, on: bool) {
    login::set(&app, on);
}

#[tauri::command]
pub fn toggle_widget(app: AppHandle) {
    float::outside_command(&app, widget::toggle);
}

#[tauri::command]
pub fn widget_open(app: AppHandle) -> bool {
    widget::is_open(&app)
}

/// The mini timer's size and opacity, from Settings. `idle` is the size of the
/// time alone, when it shows only that until the pointer is over it.
#[tauri::command]
pub fn set_widget_look(app: AppHandle, width: f64, height: f64, opacity: f64, idle: Option<(f64, f64)>) {
    widget::set_look(&app, widget::Look { width, height, opacity, idle });
}

