//! What the frontend can ask of the app. Thin: the work is in the modules.

use tauri::{AppHandle, State};

use crate::clock::{Clock, TimerState};
use crate::{alert, chime, effect, glass, login, tray, widget};

/// The window's timer changed: start, pause, a new phase, a reset.
#[tauri::command]
pub fn sync_timer(app: AppHandle, clock: State<'_, Clock>, state: TimerState) {
    let running = state.running();
    let before = clock.replace(state);
    if before.running() != running {
        tray::refresh(&app, running);
    }
}

#[tauri::command]
pub fn ring(sound: String, volume: f64) {
    chime::play(&sound, volume);
}

/// Makes the end-of-phase card ahead of time, hidden (alert.rs says why).
#[tauri::command]
pub fn prepare_alert(app: AppHandle) {
    let _ = alert::prepare(&app);
}

#[tauri::command]
pub fn show_alert(app: AppHandle, notice: alert::Notice) {
    alert::show(&app, notice);
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
    let _ = effect::prepare(&app);
}

/// "ripple" or "glow", now: at the end of a phase, and when Settings tries one.
#[tauri::command]
pub fn show_effect(app: AppHandle, kind: String, palette: String) {
    effect::show(&app, kind, palette);
}

#[tauri::command]
pub fn set_glass(app: AppHandle, glass: bool) {
    glass::main(&app, glass);
}

#[tauri::command]
pub fn set_open_at_login(app: AppHandle, on: bool) {
    login::set(&app, on);
}

#[tauri::command]
pub fn toggle_widget(app: AppHandle) {
    widget::toggle(&app);
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

