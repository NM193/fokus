//! The keyboard shortcut that starts and pauses the timer from any app.
//!
//! Control-Option-F, F for Fokus. Control-Option combinations type no
//! characters and few apps claim them -- unlike Command-Option-F (Replace in
//! most editors) or Control-Option-Space (switching keyboard layouts, which a
//! Mac with a Serbian layout is likely to use).

use tauri::plugin::TauriPlugin;
use tauri::{App, Emitter, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// As the tray menu shows it next to Start/Pause.
pub const ACCELERATOR: &str = "Ctrl+Alt+F";

fn toggle() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyF)
}

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state == ShortcutState::Pressed && shortcut == &toggle() {
                let _ = app.emit_to("main", "fokus://command", "toggle");
            }
        })
        .build()
}

/// Registered after the plugin rather than through it: if another app already
/// holds the shortcut, Fokus starts without one instead of not starting.
pub fn register(app: &App) {
    let _ = app.global_shortcut().register(toggle());
}
