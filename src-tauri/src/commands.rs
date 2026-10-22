//! What the frontend can ask of the app. Thin: the work is in the modules.

use tauri::{AppHandle, State};

use crate::clock::{Clock, TimerState};
use crate::{chime, glass, login, tray, widget};

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
pub fn ring() {
    chime::play();
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

